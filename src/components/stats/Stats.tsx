import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Play, CheckCircle, Radio, Clock, AlertCircle } from "lucide-react";
import { getListeningStats, getEvents } from "../../services/storage/events";
import { getSubscription } from "../../services/storage/subscriptions";
import type { LocalEvent } from "../../types";

type Period = "today" | "week" | "month" | "allTime";

interface StatsProps {
  onBack: () => void;
}

interface PodcastInfo {
  feedUrl: string;
  title: string;
  playCount: number;
}

// Safe URL hostname extraction
const getFallbackTitle = (feedUrl: string): string => {
  try {
    return new URL(feedUrl).hostname;
  } catch {
    return feedUrl.length > 50 ? feedUrl.slice(0, 50) + "..." : feedUrl;
  }
};

const getPeriodStart = (period: Period): number => {
  const now = Date.now();
  switch (period) {
    case "today":
      return now - 24 * 60 * 60 * 1000;
    case "week":
      return now - 7 * 24 * 60 * 60 * 1000;
    case "month":
      return now - 30 * 24 * 60 * 60 * 1000;
    case "allTime":
      return 0;
  }
};

const formatRelativeTime = (timestamp: number, t: (key: string, options?: Record<string, unknown>) => string): string => {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / (60 * 1000));
  const hours = Math.floor(diff / (60 * 60 * 1000));
  const days = Math.floor(diff / (24 * 60 * 60 * 1000));

  if (minutes < 1) return t("syncSettings.justNow");
  if (minutes < 60) return t("syncSettings.minutesAgo", { count: minutes });
  if (hours < 24) return t("syncSettings.hoursAgo", { count: hours });
  return t("syncSettings.daysAgo", { count: days });
};

export const Stats = ({ onBack }: StatsProps) => {
  const { t } = useTranslation();
  const [period, setPeriod] = useState<Period>("week");
  const [stats, setStats] = useState<{
    totalPlays: number;
    completedPlays: number;
    topPodcasts: PodcastInfo[];
  }>({ totalPlays: 0, completedPlays: 0, topPodcasts: [] });
  const [recentEvents, setRecentEvents] = useState<LocalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadStats = async () => {
      setLoading(true);
      setError(null);

      try {
        const since = getPeriodStart(period);
        const rawStats = await getListeningStats(since);

        // Enrich top podcasts with titles (with individual error handling)
        const enrichedPodcasts: PodcastInfo[] = await Promise.all(
          rawStats.topPodcasts.map(async (p) => {
            try {
              const sub = await getSubscription(p.feedUrl);
              return {
                feedUrl: p.feedUrl,
                title: sub?.title || getFallbackTitle(p.feedUrl),
                playCount: p.count,
              };
            } catch {
              return {
                feedUrl: p.feedUrl,
                title: getFallbackTitle(p.feedUrl),
                playCount: p.count,
              };
            }
          })
        );

        setStats({
          ...rawStats,
          topPodcasts: enrichedPodcasts,
        });

        // Load recent events
        const events = await getEvents({ since, limit: 20 });
        setRecentEvents(events);
      } catch (err) {
        console.error("Failed to load stats:", err);
        setError(t("common.error"));
        setStats({ totalPlays: 0, completedPlays: 0, topPodcasts: [] });
        setRecentEvents([]);
      } finally {
        setLoading(false);
      }
    };

    loadStats();
  }, [period, t]);

  const getEventIcon = (type: string) => {
    switch (type) {
      case "play_started":
        return <Play size={16} className="text-green-500" aria-hidden="true" />;
      case "play_completed":
        return <CheckCircle size={16} className="text-blue-500" aria-hidden="true" />;
      case "play_paused":
        return <Clock size={16} className="text-orange-500" aria-hidden="true" />;
      case "subscription_added":
      case "subscription_removed":
        return <Radio size={16} className="text-purple-500" aria-hidden="true" />;
      default:
        return <Play size={16} className="text-gray-500" aria-hidden="true" />;
    }
  };

  const getEventLabel = (event: LocalEvent): string => {
    switch (event.type) {
      case "play_started":
        return t("stats.playStarted");
      case "play_completed":
        return t("stats.playCompleted");
      case "play_paused":
        return t("stats.playPaused");
      case "subscription_added":
        return t("stats.added");
      case "subscription_removed":
        return t("stats.removed");
      default:
        return event.type;
    }
  };

  const periods = useMemo(() => [
    { id: "today" as const, label: t("stats.today") },
    { id: "week" as const, label: t("stats.week") },
    { id: "month" as const, label: t("stats.month") },
    { id: "allTime" as const, label: t("stats.allTime") },
  ], [t]);

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3">
        <button
          onClick={onBack}
          className="p-1 -ml-1 text-gray-600 hover:text-gray-900"
          aria-label={t("settings.back")}
        >
          <ArrowLeft size={24} aria-hidden="true" />
        </button>
        <h1 className="text-lg font-semibold">{t("stats.title")}</h1>
      </div>

      <div className="flex-1 overflow-y-auto pb-16">
        {/* Period selector */}
        <div className="bg-white px-4 py-3 border-b border-gray-200">
          <div className="flex gap-2">
            {periods.map((p) => (
              <button
                key={p.id}
                onClick={() => setPeriod(p.id)}
                aria-pressed={period === p.id}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  period === p.id
                    ? "bg-blue-500 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="p-4 text-center text-gray-500">
            {t("common.loading")}
          </div>
        ) : error ? (
          <div className="p-8 text-center">
            <AlertCircle size={48} className="mx-auto text-red-400 mb-2" aria-hidden="true" />
            <p className="text-red-500">{error}</p>
          </div>
        ) : (
          <>
            {/* Stats cards */}
            <div className="grid grid-cols-2 gap-3 p-4">
              <div className="bg-white rounded-lg p-4 shadow-sm">
                <div className="text-3xl font-bold text-blue-500">
                  {stats.totalPlays}
                </div>
                <div className="text-sm text-gray-500 mt-1">
                  {t("stats.totalPlays")}
                </div>
              </div>
              <div className="bg-white rounded-lg p-4 shadow-sm">
                <div className="text-3xl font-bold text-green-500">
                  {stats.completedPlays}
                </div>
                <div className="text-sm text-gray-500 mt-1">
                  {t("stats.completed")}
                </div>
              </div>
            </div>

            {/* Top podcasts */}
            {stats.topPodcasts.length > 0 && (
              <div className="bg-white mt-2">
                <div className="px-4 py-3 border-b border-gray-100">
                  <h2 className="font-semibold text-gray-900">
                    {t("stats.topPodcasts")}
                  </h2>
                </div>
                <div className="divide-y divide-gray-100">
                  {stats.topPodcasts.slice(0, 5).map((podcast, index) => (
                    <div
                      key={podcast.feedUrl}
                      className="px-4 py-3 flex items-center gap-3"
                    >
                      <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 text-sm font-medium flex items-center justify-center">
                        {index + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900 truncate">
                          {podcast.title}
                        </div>
                      </div>
                      <span className="text-sm text-gray-500">
                        {t("stats.plays", { count: podcast.playCount })}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recent activity */}
            <div className="bg-white mt-2">
              <div className="px-4 py-3 border-b border-gray-100">
                <h2 className="font-semibold text-gray-900">
                  {t("stats.recentActivity")}
                </h2>
              </div>
              {recentEvents.length === 0 ? (
                <div className="px-4 py-8 text-center text-gray-500">
                  {t("stats.noActivity")}
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {recentEvents.slice(0, 10).map((event) => (
                    <div
                      key={event.id}
                      className="px-4 py-3 flex items-center gap-3"
                    >
                      <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                        {getEventIcon(event.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900">
                          {getEventLabel(event)}
                        </div>
                        <div className="text-xs text-gray-500">
                          {formatRelativeTime(event.timestamp, t)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Empty state */}
            {stats.totalPlays === 0 && recentEvents.length === 0 && (
              <div className="p-8 text-center">
                <div className="text-gray-400 mb-2">
                  <Play size={48} className="mx-auto" aria-hidden="true" />
                </div>
                <p className="text-gray-500">{t("stats.noData")}</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
