import { createContext } from "react";
import type { Episode, DownloadedEpisode, DownloadProgress } from "../types";

export interface DownloadContextType {
  downloads: Map<string, DownloadedEpisode>;
  progress: Map<string, DownloadProgress>;
  isDownloaded: (episodeId: string) => boolean;
  isDownloading: (episodeId: string) => boolean;
  getProgress: (episodeId: string) => DownloadProgress | undefined;
  download: (episode: Episode, feedUrl: string) => Promise<void>;
  deleteDownload: (episodeId: string) => Promise<void>;
  clearAllDownloads: () => Promise<void>;
  refresh: () => Promise<void>;
}

export const DownloadContext = createContext<DownloadContextType | null>(null);
