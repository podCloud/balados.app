import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ChevronRight, Loader2, AlertTriangle, X } from "lucide-react";
import { fetchAndParseRSS } from "../../services/rss/parser";
import { removeSubscription } from "../../services/storage/subscriptions";
import type { PodcastFeed } from "../../types";

interface SubscriptionItemProps {
  url: string;
  onNavigate: (view: string, feedUrl?: string | null) => void;
}

export const SubscriptionItem = ({ url, onNavigate }: SubscriptionItemProps) => {
  const { t } = useTranslation();

  const { data: feed, isLoading, error } = useQuery<PodcastFeed>({
    queryKey: ["feed", url],
    queryFn: () => fetchAndParseRSS(url),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  const handleUnsubscribe = async () => {
    const title = feed?.title || url;
    if (window.confirm(t("library.unsubscribeConfirm", { title }))) {
      await removeSubscription(url);
    }
  };

  const displayTitle =
    feed?.title ||
    url.replace("https://", "").replace("http://", "").split("/")[0];
  const displayImage =
    feed?.image ||
    'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="56" height="56"%3E%3Crect fill="%23ddd" width="56" height="56"/%3E%3C/svg%3E';
  const episodeCount = feed?.items?.length || 0;

  if (error) {
    return (
      <div className="flex items-center px-4 py-3 bg-red-50 border-b border-red-100">
        <div className="w-14 h-14 bg-red-200 rounded-lg flex items-center justify-center">
          <AlertTriangle size={24} className="text-red-600" aria-hidden="true" />
        </div>
        <div className="ml-3 flex-1 min-w-0">
          <div className="text-sm font-medium text-red-900 truncate">
            {displayTitle}
          </div>
          <div className="text-xs text-red-600">{t("library.loadError")}</div>
        </div>
        <button
          onClick={handleUnsubscribe}
          className="ml-2 text-red-500 px-2"
          aria-label={t("library.unsubscribe")}
        >
          <X size={20} aria-hidden="true" />
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => (feed ? onNavigate("podcast", url) : null)}
      disabled={isLoading}
      className={`w-full flex items-center px-4 py-3 bg-white hover:bg-gray-50 active:bg-gray-100 ${isLoading ? "opacity-60" : ""}`}
    >
      <div className="relative">
        <img
          src={displayImage}
          alt={displayTitle}
          className="w-14 h-14 rounded-lg"
        />
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-50 rounded-lg">
            <Loader2 size={24} className="text-blue-500 animate-spin" aria-hidden="true" />
          </div>
        )}
      </div>
      <div className="ml-3 text-left flex-1 min-w-0">
        <div className="font-medium text-sm text-gray-900 truncate">
          {displayTitle}
          {isLoading && (
            <span className="text-gray-400 ml-2">{t("common.loading")}</span>
          )}
        </div>
        <div className="text-xs text-gray-500 mt-0.5">
          {isLoading
            ? t("library.loadingEpisodes")
            : t("library.episodeCount", { count: episodeCount })}
        </div>
      </div>
      {!isLoading && <ChevronRight size={20} className="text-gray-400 ml-2" aria-hidden="true" />}
    </button>
  );
};
