import { useState, useRef, useEffect } from "react";
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

  const subscribedUrls = useLiveQuery(
    async () => {
      const subs = await db.subscriptions.toArray();
      return new Set(subs.map((s) => s.url));
    },
    []
  );

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
          isSubscribed={subscribedUrls?.has(podcast.feed_url) ?? false}
          onNavigate={onNavigate}
        />
      ))}
    </div>
  );
};

interface TrendingItemProps {
  podcast: TrendingPodcast;
  isSubscribed: boolean;
  onNavigate: (view: string, feedUrl?: string | null) => void;
}

const TrendingItem = ({ podcast, isSubscribed, onNavigate }: TrendingItemProps) => {
  const { t } = useTranslation();
  const [subscribing, setSubscribing] = useState(false);
  const [subscribeError, setSubscribeError] = useState(false);
  const errorTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    return () => clearTimeout(errorTimeoutRef.current);
  }, []);

  const handleSubscribe = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isSubscribed || subscribing) return;
    clearTimeout(errorTimeoutRef.current);
    setSubscribing(true);
    setSubscribeError(false);
    try {
      await addSubscription(podcast.feed_url);
    } catch (err) {
      console.error("Failed to subscribe:", err);
      setSubscribeError(true);
      errorTimeoutRef.current = setTimeout(() => setSubscribeError(false), 3000);
    } finally {
      setSubscribing(false);
    }
  };

  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50">
      <a
        className="flex-1 min-w-0 flex items-center gap-3 cursor-pointer"
        href="#"
        onClick={(e) => { e.preventDefault(); onNavigate("podcast", podcast.feed_url); }}
      >
        {podcast.image ? (
          <img
            src={podcast.image}
            alt={podcast.title}
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
      </a>
      <button
        onClick={handleSubscribe}
        disabled={isSubscribed || subscribing}
        className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium ${
          subscribeError
            ? "bg-red-100 text-red-600"
            : isSubscribed
              ? "bg-gray-100 text-gray-500"
              : "bg-blue-500 text-white hover:bg-blue-600"
        }`}
        aria-label={isSubscribed ? t("trending.subscribed") : t("trending.subscribe")}
      >
        {subscribing
          ? t("common.loading")
          : subscribeError
            ? t("common.error")
            : isSubscribed
              ? t("trending.subscribed")
              : t("trending.subscribe")}
      </button>
    </div>
  );
};

const SKELETON_ITEM_COUNT = 6;

const TrendingLoading = () => (
  <div className="divide-y divide-gray-200">
    {Array.from({ length: SKELETON_ITEM_COUNT }).map((_, i) => (
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
