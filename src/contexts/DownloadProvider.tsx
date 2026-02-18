import { type ReactNode, useCallback, useEffect, useState } from "react";
import {
  clearAllDownloads as clearAllDownloadsService,
  deleteDownload as deleteDownloadService,
  downloadEpisode as downloadEpisodeService,
  getAllDownloads,
  getEpisodeId,
} from "../services/storage/downloads";
import type { DownloadedEpisode, DownloadProgress, Episode } from "../types";
import { DownloadContext } from "./downloadContext";

interface DownloadProviderProps {
  children: ReactNode;
}

export const DownloadProvider = ({ children }: DownloadProviderProps) => {
  const [downloads, setDownloads] = useState<Map<string, DownloadedEpisode>>(new Map());
  const [progress, setProgress] = useState<Map<string, DownloadProgress>>(new Map());

  const refresh = useCallback(async () => {
    const allDownloads = await getAllDownloads();
    const downloadsMap = new Map<string, DownloadedEpisode>();
    for (const d of allDownloads) {
      downloadsMap.set(d.episodeId, d);
    }
    setDownloads(downloadsMap);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const isDownloaded = useCallback(
    (episodeId: string): boolean => {
      return downloads.has(episodeId);
    },
    [downloads],
  );

  const isDownloading = useCallback(
    (episodeId: string): boolean => {
      const p = progress.get(episodeId);
      return p?.status === "downloading";
    },
    [progress],
  );

  const getProgress = useCallback(
    (episodeId: string): DownloadProgress | undefined => {
      return progress.get(episodeId);
    },
    [progress],
  );

  const download = useCallback(
    async (episode: Episode, feedUrl: string): Promise<void> => {
      const episodeId = getEpisodeId(episode);

      // Prevent duplicate downloads - check via setter to avoid stale closure
      // Note: This pattern works because React 18+ executes the functional updater
      // synchronously, so `alreadyDownloading` is set before we check it below.
      let alreadyDownloading = false;
      setProgress((prev) => {
        if (prev.has(episodeId)) {
          alreadyDownloading = true;
          return prev;
        }
        const next = new Map(prev);
        next.set(episodeId, {
          episodeId,
          percent: 0,
          status: "downloading",
        });
        return next;
      });

      if (alreadyDownloading) return;

      try {
        await downloadEpisodeService(episode, feedUrl, (percent) => {
          setProgress((prev) => {
            const next = new Map(prev);
            next.set(episodeId, {
              episodeId,
              percent,
              status: "downloading",
            });
            return next;
          });
        });

        // Mark as completed
        setProgress((prev) => {
          const next = new Map(prev);
          next.set(episodeId, {
            episodeId,
            percent: 100,
            status: "completed",
          });
          return next;
        });

        // Refresh downloads list
        await refresh();

        // Clear progress after a short delay
        setTimeout(() => {
          setProgress((prev) => {
            const next = new Map(prev);
            next.delete(episodeId);
            return next;
          });
        }, 1000);
      } catch (error) {
        setProgress((prev) => {
          const next = new Map(prev);
          next.set(episodeId, {
            episodeId,
            percent: 0,
            status: "error",
            error: error instanceof Error ? error.message : "Unknown error",
          });
          return next;
        });
      }
    },
    [refresh],
  );

  const deleteDownload = useCallback(async (episodeId: string): Promise<void> => {
    await deleteDownloadService(episodeId);
    setDownloads((prev) => {
      const next = new Map(prev);
      next.delete(episodeId);
      return next;
    });
  }, []);

  const clearAllDownloads = useCallback(async (): Promise<void> => {
    await clearAllDownloadsService();
    setDownloads(new Map());
  }, []);

  return (
    <DownloadContext.Provider
      value={{
        downloads,
        progress,
        isDownloaded,
        isDownloading,
        getProgress,
        download,
        deleteDownload,
        clearAllDownloads,
        refresh,
      }}
    >
      {children}
    </DownloadContext.Provider>
  );
};
