import { useQuery } from "@tanstack/react-query";
import { ChevronRight, LoaderCircle, TriangleExclamationPoint, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { fetchAndParseRSS } from "../../services/rss/parser";
import { rssQueryRetry, rssQueryRetryDelay } from "../../services/rss/proxyManager";
import { removeSubscription } from "../../services/storage/subscriptions";
import type { PodcastFeed } from "../../types";
import { Artwork } from "../ui/Artwork";

interface SubscriptionItemProps {
  url: string;
  onNavigate: (view: string, feedUrl?: string | null) => void;
}

export const SubscriptionItem = ({ url, onNavigate }: SubscriptionItemProps) => {
  const { t } = useTranslation();

  const {
    data: feed,
    isLoading,
    error,
  } = useQuery<PodcastFeed>({
    queryKey: ["feed", url],
    queryFn: () => fetchAndParseRSS(url),
    retry: rssQueryRetry,
    retryDelay: rssQueryRetryDelay,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  const handleUnsubscribe = async () => {
    const title = feed?.title || url;
    if (window.confirm(t("library.unsubscribeConfirm", { title }))) {
      await removeSubscription(url);
    }
  };

  const displayTitle =
    feed?.title || url.replace("https://", "").replace("http://", "").split("/")[0];
  const episodeCount = feed?.items?.length || 0;

  if (error) {
    return (
      <div className="flex items-center px-4 py-3 bg-red-50 border-b border-red-100">
        <div className="w-14 h-14 bg-red-200 rounded-lg flex items-center justify-center">
          <TriangleExclamationPoint size={24} className="text-red-600" aria-hidden="true" />
        </div>
        <div className="ml-3 flex-1 min-w-0">
          <div className="text-sm font-medium text-red-900 truncate">{displayTitle}</div>
          <div className="text-xs text-red-600">{t("library.loadError")}</div>
        </div>
        <button
          type="button"
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
      type="button"
      onClick={() => (feed ? onNavigate("podcast", url) : null)}
      disabled={isLoading}
      className={`w-full flex items-center px-4 py-3 bg-white hover:bg-gray-50 active:bg-gray-100 ${isLoading ? "opacity-60" : ""}`}
    >
      <div className="relative">
        <Artwork src={feed?.image} alt={displayTitle} className="w-14 h-14 rounded-lg" />
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-50 rounded-lg">
            <LoaderCircle size={24} className="text-blue-500 animate-spin" aria-hidden="true" />
          </div>
        )}
      </div>
      <div className="ml-3 text-left flex-1 min-w-0">
        <div className="font-medium text-sm text-gray-900 truncate">
          {displayTitle}
          {isLoading && <span className="text-gray-400 ml-2">{t("common.loading")}</span>}
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
