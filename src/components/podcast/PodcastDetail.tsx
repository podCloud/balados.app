import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  ChevronLeft,
  RefreshCw,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { fetchAndParseRSS } from "../../services/rss/parser";
import { invalidateFeedCache } from "../../services/storage";
import { EpisodeList } from "./EpisodeList";
import type { PodcastFeed } from "../../types";

interface PodcastDetailProps {
  feedUrl: string;
  onNavigate: (view: string, feedUrl?: string | null) => void;
}

export const PodcastDetail = ({ feedUrl, onNavigate }: PodcastDetailProps) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const {
    data: feed,
    isLoading,
    error,
    refetch,
  } = useQuery<PodcastFeed>({
    queryKey: ["feed", feedUrl],
    queryFn: () => fetchAndParseRSS(feedUrl),
    staleTime: 1000 * 60 * 5,
  });

  const handleRefresh = async () => {
    await invalidateFeedCache(feedUrl);
    queryClient.invalidateQueries({ queryKey: ["feed", feedUrl] });
    refetch();
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <Loader2 size={48} className="mx-auto mb-4 text-blue-500 animate-spin" aria-hidden="true" />
          <div className="text-gray-500 text-sm">{t("common.loading")}</div>
        </div>
      </div>
    );
  }

  if (error || !feed) {
    return (
      <div className="h-full flex flex-col">
        <div className="bg-blue-500 px-4 py-3 flex items-center gap-3 shadow-sm">
          <button
            onClick={() => onNavigate("library")}
            className="text-white text-base flex items-center gap-1"
          >
            <ChevronLeft size={20} aria-hidden="true" />
            <span>{t("podcast.backToLibrary")}</span>
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center">
            <AlertTriangle size={48} className="mx-auto mb-4 text-orange-500" aria-hidden="true" />
            <h2 className="text-lg font-semibold text-gray-700 mb-2">
              {t("common.error")}
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              {t("podcast.loadError")}
            </p>
            <button
              onClick={handleRefresh}
              className="bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium inline-flex items-center gap-2"
            >
              <RefreshCw size={16} aria-hidden="true" />
              {t("common.retry")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full pb-16 flex flex-col">
      <div className="bg-blue-500 px-4 py-3 flex items-center gap-3 shadow-sm">
        <button
          onClick={() => onNavigate("library")}
          className="text-white text-base flex items-center gap-1"
        >
          <ChevronLeft size={20} aria-hidden="true" />
          <span>{t("podcast.backToLibrary")}</span>
        </button>
        <button
          onClick={handleRefresh}
          className="ml-auto text-white text-sm flex items-center gap-1"
        >
          <RefreshCw size={14} aria-hidden="true" />
          {t("podcast.refresh")}
        </button>
      </div>

      <div className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="flex gap-4">
          <img
            src={
              feed.image ||
              'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="80" height="80"%3E%3Crect fill="%23ddd" width="80" height="80"/%3E%3C/svg%3E'
            }
            alt={feed.title}
            className="w-20 h-20 rounded-lg shadow-sm"
          />
          <div className="flex-1 min-w-0">
            <h1 className="font-semibold text-base text-gray-900 mb-1">
              {feed.title}
            </h1>
            <p className="text-xs text-gray-500 line-clamp-3">
              {feed.description}
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <EpisodeList episodes={feed.items} feedUrl={feedUrl} />
      </div>
    </div>
  );
};
