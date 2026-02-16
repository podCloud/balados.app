import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useLiveQuery } from "dexie-react-hooks";
import { TrendingUp, RefreshCw, Podcast } from "lucide-react";
import { useTrending } from "../../hooks/useTrending";
import { db } from "../../services/storage";
import { addSubscription } from "../../services/storage/subscriptions";
import type { TrendingPodcast } from "../../services/sync/client";

interface TrendingProps {
  onNavigate: (view: string, feedUrl?: string | null) => void;
}

export const Trending = ({ onNavigate }: TrendingProps) => {
  const { t } = useTranslation();
  const { data: podcasts, isLoading, error, refetch } = useTrending();

  if (isLoading) {
    return <TrendingLoading />;
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-gray-400 px-4">
        <TrendingUp size={48} className="mb-3 text-gray-300" />
        <p className="text-sm text-gray-500 mb-3 text-center">
          {t("trending.loadError")}
        </p>
        <button
          onClick={() => refetch()}
          className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600"
        >
          <RefreshCw size={16} aria-hidden="true" />
          {t("common.retry")}
        </button>
      </div>
    );
  }

  if (!podcasts || podcasts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-gray-400">
        <Podcast size={48} className="mb-3 text-gray-300" />
        <p className="text-sm">{t("trending.empty")}</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-gray-200">
      {podcasts.map((podcast) => (
        <TrendingItem
          key={podcast.feed_url}
          podcast={podcast}
          onNavigate={onNavigate}
        />
      ))}
    </div>
  );
};

interface TrendingItemProps {
  podcast: TrendingPodcast;
  onNavigate: (view: string, feedUrl?: string | null) => void;
}

const TrendingItem = ({ podcast, onNavigate }: TrendingItemProps) => {
  const { t } = useTranslation();
  const [subscribing, setSubscribing] = useState(false);

  const isSubscribed = useLiveQuery(
    () => db.subscriptions.get(podcast.feed_url).then((s) => !!s),
    [podcast.feed_url]
  );

  const handleSubscribe = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isSubscribed || subscribing) return;
    setSubscribing(true);
    try {
      await addSubscription(podcast.feed_url);
    } finally {
      setSubscribing(false);
    }
  };

  return (
    <button
      onClick={() => onNavigate("podcast", podcast.feed_url)}
      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 text-left"
    >
      {podcast.image ? (
        <img
          src={podcast.image}
          alt=""
          className="w-16 h-16 rounded-lg object-cover flex-shrink-0 bg-gray-100"
          loading="lazy"
        />
      ) : (
        <div className="w-16 h-16 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
          <Podcast size={24} className="text-gray-400" aria-hidden="true" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">
          {podcast.title}
        </p>
        <p className="text-xs text-gray-500 mt-0.5">
          {t("trending.subscribers", { count: podcast.subscriber_count })}
        </p>
      </div>
      <div
        onClick={handleSubscribe}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleSubscribe(e as unknown as React.MouseEvent); } }}
        className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium ${
          isSubscribed
            ? "bg-gray-100 text-gray-500"
            : "bg-blue-500 text-white hover:bg-blue-600"
        }`}
        aria-label={isSubscribed ? t("trending.subscribed") : t("trending.subscribe")}
      >
        {subscribing
          ? t("common.loading")
          : isSubscribed
            ? t("trending.subscribed")
            : t("trending.subscribe")}
      </div>
    </button>
  );
};

const TrendingLoading = () => (
  <div className="divide-y divide-gray-200">
    {Array.from({ length: 6 }).map((_, i) => (
      <div key={i} className="flex items-center gap-3 px-4 py-3 animate-pulse">
        <div className="w-16 h-16 rounded-lg bg-gray-200 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
          <div className="h-3 bg-gray-200 rounded w-1/3" />
        </div>
        <div className="w-20 h-7 bg-gray-200 rounded-full flex-shrink-0" />
      </div>
    ))}
  </div>
);
