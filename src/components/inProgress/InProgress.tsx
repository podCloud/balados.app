import { useQuery } from "@tanstack/react-query";
import { useLiveQuery } from "dexie-react-hooks";
import { ChevronLeft, Clock, EyeOff, Pause, Play, X } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { usePlayer } from "../../contexts";
import { fetchAndParseRSS } from "../../services/rss/parser";
import { getCachedFeed } from "../../services/storage";
import { getHiddenEpisodeIds, hideEpisode } from "../../services/storage/hiddenEpisodes";
import { generateEpisodeId, getInProgressEpisodes } from "../../services/storage/playStatus";
import type { Episode, PlayStatus, PodcastFeed } from "../../types";
import { DownloadButton } from "../ui/DownloadButton";

interface InProgressProps {
  onBack: () => void;
}

interface EnrichedEpisode {
  episode: Episode;
  feedUrl: string;
  feedTitle: string;
  feedImage: string;
  playStatus: PlayStatus;
}

const formatTime = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

export const InProgress = ({ onBack }: InProgressProps) => {
  const { t } = useTranslation();
  const { play, pause, currentEpisode, isPlaying } = usePlayer();

  const hiddenEpisodes = useLiveQuery(() => getHiddenEpisodeIds(), []);

  // Get in-progress episodes from DB (reactive)
  const playStatuses = useLiveQuery(() => getInProgressEpisodes(), []);

  // Get unique feed URLs (sorted for stable query key)
  const feedUrls = useMemo(() => {
    if (!playStatuses) return [];
    return [...new Set(playStatuses.map((s) => s.feedUrl))].sort();
  }, [playStatuses]);

  // Stable key for React Query (arrays are compared by reference)
  const feedUrlsKey = useMemo(() => feedUrls.join(","), [feedUrls]);

  // Fetch feeds for all unique URLs
  const feedQueries = useQuery({
    queryKey: ["in-progress-feeds", feedUrlsKey],
    queryFn: async () => {
      const feeds: Map<string, PodcastFeed> = new Map();

      await Promise.all(
        feedUrls.map(async (url) => {
          try {
            // Try cache first
            const cached = await getCachedFeed(url);
            if (cached) {
              feeds.set(url, cached);
              return;
            }

            // Fetch if not cached
            const feed = await fetchAndParseRSS(url);
            if (feed) {
              feeds.set(url, feed);
            }
          } catch (error) {
            console.error(`Failed to fetch feed ${url}:`, error);
          }
        }),
      );

      return feeds;
    },
    enabled: feedUrls.length > 0,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  // Enrich play statuses with episode data
  const enrichedEpisodes = useMemo((): EnrichedEpisode[] => {
    if (!playStatuses || !feedQueries.data || !hiddenEpisodes) return [];

    const result: EnrichedEpisode[] = [];

    for (const status of playStatuses) {
      // Skip hidden episodes
      if (hiddenEpisodes.has(status.episodeId)) continue;

      const feed = feedQueries.data.get(status.feedUrl);
      if (!feed) continue;

      // Find matching episode by ID using the same generation logic
      const episode = feed.items.find((ep) => {
        const epId = generateEpisodeId(ep.guid, ep.enclosureUrl);
        return epId === status.episodeId;
      });

      if (episode) {
        result.push({
          episode,
          feedUrl: status.feedUrl,
          feedTitle: feed.title,
          feedImage: feed.image,
          playStatus: status,
        });
      }
    }

    // Sort by last updated (most recent first)
    result.sort((a, b) => b.playStatus.updatedAt - a.playStatus.updatedAt);

    return result;
  }, [playStatuses, feedQueries.data, hiddenEpisodes]);

  const handleHide = async (episodeId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await hideEpisode(episodeId);
  };

  const handleClick = (item: EnrichedEpisode) => {
    const episodeId = item.episode.guid || item.episode.enclosureUrl;
    const currentId = currentEpisode?.guid || currentEpisode?.enclosureUrl;

    if (currentId === episodeId && isPlaying) {
      pause();
    } else {
      play(item.episode, item.feedUrl);
    }
  };

  const isCurrentEpisode = (episode: Episode) => {
    const episodeId = episode.guid || episode.enclosureUrl;
    const currentId = currentEpisode?.guid || currentEpisode?.enclosureUrl;
    return currentId === episodeId;
  };

  const isLoading = !playStatuses || !hiddenEpisodes || feedQueries.isLoading;

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="flex items-center gap-2 p-4 border-b border-gray-200">
        <button
          type="button"
          onClick={onBack}
          className="p-1 -ml-1 hover:bg-gray-100 rounded-lg"
          aria-label={t("settings.back")}
        >
          <ChevronLeft size={24} aria-hidden="true" />
        </button>
        <h1 className="text-lg font-semibold flex-1">{t("inProgress.title")}</h1>
        <Clock size={20} className="text-gray-400" aria-hidden="true" />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-8 text-center text-gray-500">{t("common.loading")}</div>
        ) : enrichedEpisodes.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <EyeOff size={48} className="mx-auto mb-4 text-gray-300" aria-hidden="true" />
            <p>{t("inProgress.empty")}</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {enrichedEpisodes.map((item) => {
              const isCurrent = isCurrentEpisode(item.episode);
              const isEpisodePlaying = isCurrent && isPlaying;
              const progress =
                item.playStatus.duration > 0
                  ? (item.playStatus.position / item.playStatus.duration) * 100
                  : 0;

              return (
                <button
                  type="button"
                  key={item.playStatus.episodeId}
                  onClick={() => handleClick(item)}
                  className={`w-full text-left px-4 py-3 hover:bg-gray-50 active:bg-gray-100 ${
                    isCurrent ? "bg-blue-50" : ""
                  }`}
                >
                  <div className="flex gap-3">
                    {/* Episode image */}
                    <div className="relative flex-shrink-0">
                      <img
                        src={item.episode.image || item.feedImage}
                        alt={item.episode.title}
                        className="w-14 h-14 rounded-lg object-cover bg-gray-200"
                        onError={(e) => {
                          const img = e.target as HTMLImageElement;
                          // Only fallback if we haven't tried feedImage yet
                          if (item.feedImage && img.src !== item.feedImage) {
                            img.src = item.feedImage;
                          } else {
                            // Hide broken image and show placeholder bg
                            img.style.visibility = "hidden";
                          }
                        }}
                      />
                      <div
                        className={`absolute inset-0 flex items-center justify-center rounded-lg ${
                          isCurrent ? "bg-blue-500/80" : "bg-black/40 opacity-0 hover:opacity-100"
                        } transition-opacity`}
                      >
                        {isEpisodePlaying ? (
                          <Pause size={24} className="text-white" fill="white" aria-hidden="true" />
                        ) : (
                          <Play
                            size={24}
                            className="text-white ml-1"
                            fill="white"
                            aria-hidden="true"
                          />
                        )}
                      </div>
                    </div>

                    {/* Episode info */}
                    <div className="flex-1 min-w-0">
                      <div
                        className={`font-medium text-sm mb-0.5 line-clamp-1 ${
                          isCurrent ? "text-blue-600" : "text-gray-900"
                        }`}
                      >
                        {item.episode.title}
                      </div>
                      <div className="text-xs text-gray-500 mb-1.5 line-clamp-1">
                        {item.feedTitle}
                      </div>

                      {/* Progress bar */}
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              isCurrent ? "bg-blue-500" : "bg-gray-400"
                            }`}
                            style={{ width: `${Math.min(progress, 100)}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-400 flex-shrink-0">
                          {formatTime(item.playStatus.position)}
                          {item.playStatus.duration > 0 && (
                            <span className="text-gray-300">
                              {" / "}
                              {formatTime(item.playStatus.duration)}
                            </span>
                          )}
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 flex-shrink-0 self-center">
                      <DownloadButton episode={item.episode} feedUrl={item.feedUrl} />
                      <button
                        type="button"
                        onClick={(e) => handleHide(item.playStatus.episodeId, e)}
                        className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
                        title={t("inProgress.hide")}
                        aria-label={t("inProgress.hide")}
                      >
                        <X size={18} aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
