import { useQuery } from "@tanstack/react-query";
import { useLiveQuery } from "dexie-react-hooks";
import { ChevronLeft, History as HistoryIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { usePlayer } from "../../contexts";
import { fetchAndParseRSS } from "../../services/rss/parser";
import { db } from "../../services/storage";
import { generateEpisodeId, getAllPlayStatuses } from "../../services/storage/playStatus";
import type { Episode, PodcastFeed } from "../../types";
import { formatRelativeTime, getFallbackTitle } from "../../utils/formatting";
import {
  computeListeningStats,
  computeStreak,
  filterPlayStatuses,
  getEpisodeStatus,
  type HistoryFilters,
  type Period,
} from "../../utils/listeningHistory";

interface ListeningHistoryProps {
  onBack: () => void;
}

const PAGE_SIZE = 50;

const formatDuration = (totalSeconds: number): string => {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
};

const formatPosition = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

const statusBadgeClass: Record<string, string> = {
  completed: "bg-green-100 text-green-700",
  inProgress: "bg-blue-100 text-blue-700",
  notStarted: "bg-gray-100 text-gray-500",
};

export const ListeningHistory = ({ onBack }: ListeningHistoryProps) => {
  const { t } = useTranslation();
  const { play } = usePlayer();
  const now = Date.now();

  const allPlayStatuses = useLiveQuery(() => getAllPlayStatuses(), []);
  const subscriptions = useLiveQuery(() => db.subscriptions.toArray(), []);
  const isLoading = allPlayStatuses === undefined || subscriptions === undefined;

  const stats = useMemo(() => {
    if (!allPlayStatuses || !subscriptions) return null;
    return {
      ...computeListeningStats(allPlayStatuses, subscriptions),
      streakDays: computeStreak(allPlayStatuses, now),
    };
  }, [allPlayStatuses, subscriptions, now]);

  const [filterFeed, setFilterFeed] = useState("");
  const [filterPeriod, setFilterPeriod] = useState<Period>("");
  const [filterStatus, setFilterStatus] = useState<HistoryFilters["status"]>("");
  const [page, setPage] = useState(1);

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally reset page when any filter changes
  useEffect(() => {
    setPage(1);
  }, [filterFeed, filterPeriod, filterStatus]);

  const filtered = useMemo(() => {
    if (!allPlayStatuses) return [];
    return filterPlayStatuses(
      allPlayStatuses,
      { feedUrl: filterFeed, period: filterPeriod, status: filterStatus },
      now,
    );
  }, [allPlayStatuses, filterFeed, filterPeriod, filterStatus, now]);

  const totalPages = Math.max(Math.ceil(filtered.length / PAGE_SIZE), 1);
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const pageFeedUrls = useMemo(
    () => [...new Set(pageItems.map((ps) => ps.feedUrl))].sort(),
    [pageItems],
  );
  const feedUrlsKey = pageFeedUrls.join(",");

  const feedQuery = useQuery({
    queryKey: ["listening-history-feeds", feedUrlsKey],
    queryFn: async () => {
      const feeds: Map<string, PodcastFeed> = new Map();
      await Promise.all(
        pageFeedUrls.map(async (url) => {
          try {
            const feed = await fetchAndParseRSS(url);
            feeds.set(url, feed);
          } catch (error) {
            console.error(`Failed to fetch feed ${url}:`, error);
          }
        }),
      );
      return feeds;
    },
    enabled: pageFeedUrls.length > 0,
    staleTime: 1000 * 60 * 5,
  });

  const enrichedPageItems = useMemo(() => {
    const feeds = feedQuery.data;
    return pageItems.map((ps) => {
      const feed = feeds?.get(ps.feedUrl);
      const episode: Episode | undefined = feed?.items.find(
        (ep) => generateEpisodeId(ep.guid, ep.enclosureUrl) === ps.episodeId,
      );
      return {
        playStatus: ps,
        episode,
        title: episode?.title ?? getFallbackTitle(ps.feedUrl),
        image: episode?.image || feed?.image,
      };
    });
  }, [pageItems, feedQuery.data]);

  return (
    <div className="h-full flex flex-col bg-white">
      <div className="flex items-center gap-2 p-4 border-b border-gray-200">
        <button
          type="button"
          onClick={onBack}
          className="p-1 -ml-1 hover:bg-gray-100 rounded-lg"
          aria-label={t("settings.back")}
        >
          <ChevronLeft size={24} aria-hidden="true" />
        </button>
        <h1 className="text-lg font-semibold flex-1">{t("listeningHistory.title")}</h1>
        <HistoryIcon size={20} className="text-gray-400" aria-hidden="true" />
      </div>

      <div className="flex flex-col gap-2 p-4 border-b border-gray-200">
        <select
          value={filterFeed}
          onChange={(e) => setFilterFeed(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-2 py-1.5"
        >
          <option value="">{t("listeningHistory.filter.allPodcasts")}</option>
          {(subscriptions ?? []).map((sub) => (
            <option key={sub.url} value={sub.url}>
              {sub.title || getFallbackTitle(sub.url)}
            </option>
          ))}
        </select>

        <div className="flex gap-2">
          {(["", "week", "month", "year"] as const).map((p) => (
            <button
              type="button"
              key={p || "all"}
              onClick={() => setFilterPeriod(p)}
              aria-pressed={filterPeriod === p}
              className={`px-3 py-1.5 rounded-full text-sm font-medium ${
                filterPeriod === p ? "bg-blue-500 text-white" : "bg-gray-100 text-gray-600"
              }`}
            >
              {p ? t(`listeningHistory.filter.${p}`) : t("listeningHistory.filter.allPeriods")}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          {(["", "completed", "inProgress", "notStarted"] as const).map((s) => (
            <button
              type="button"
              key={s || "all"}
              onClick={() => setFilterStatus(s)}
              aria-pressed={filterStatus === s}
              className={`px-3 py-1.5 rounded-full text-sm font-medium ${
                filterStatus === s ? "bg-blue-500 text-white" : "bg-gray-100 text-gray-600"
              }`}
            >
              {s ? t(`listeningHistory.status.${s}`) : t("listeningHistory.filter.allStatuses")}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pb-16">
        {isLoading ? (
          <div className="p-8 text-center text-gray-500">{t("common.loading")}</div>
        ) : allPlayStatuses.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <HistoryIcon size={48} className="mx-auto mb-4 text-gray-300" aria-hidden="true" />
            <p>{t("listeningHistory.empty")}</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-gray-500">{t("listeningHistory.noResults")}</div>
        ) : (
          <>
            {stats && (
              <div className="grid grid-cols-2 gap-3 p-4">
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="text-2xl font-bold text-blue-500">
                    {formatDuration(stats.totalTimeSeconds)}
                  </div>
                  <div className="text-sm text-gray-500 mt-1">
                    {t("listeningHistory.totalTime")}
                  </div>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="text-2xl font-bold text-gray-900">{stats.totalEpisodes}</div>
                  <div className="text-sm text-gray-500 mt-1">
                    {t("listeningHistory.totalEpisodes")}
                  </div>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="text-2xl font-bold text-green-500">{stats.completedCount}</div>
                  <div className="text-sm text-gray-500 mt-1">
                    {t("listeningHistory.completed")}
                  </div>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="text-2xl font-bold text-orange-500">{stats.streakDays}</div>
                  <div className="text-sm text-gray-500 mt-1">{t("listeningHistory.streak")}</div>
                </div>
              </div>
            )}

            <div className="divide-y divide-gray-200">
              {enrichedPageItems.map(({ playStatus, episode, title, image }) => {
                const status = getEpisodeStatus(playStatus);
                const progress =
                  playStatus.duration > 0 ? (playStatus.position / playStatus.duration) * 100 : 0;

                return (
                  <button
                    type="button"
                    key={playStatus.episodeId}
                    onClick={() => {
                      if (episode) play(episode, playStatus.feedUrl);
                    }}
                    className="w-full text-left px-4 py-3 hover:bg-gray-50 active:bg-gray-100"
                    data-testid="history-row"
                  >
                    <div className="flex gap-3">
                      <img
                        src={image}
                        alt={title}
                        className="w-14 h-14 rounded-lg object-cover bg-gray-200 flex-shrink-0"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.visibility = "hidden";
                        }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm mb-0.5 line-clamp-1 text-gray-900">
                          {title}
                        </div>
                        <div className="flex items-center gap-2 mb-1">
                          <span
                            className={`text-xs px-1.5 py-0.5 rounded ${statusBadgeClass[status]}`}
                          >
                            {t(`listeningHistory.status.${status}`)}
                          </span>
                          <span className="text-xs text-gray-400">
                            {formatRelativeTime(playStatus.updatedAt, t, now)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full bg-blue-500"
                              style={{ width: `${Math.min(progress, 100)}%` }}
                            />
                          </div>
                          <span className="text-xs text-gray-400 flex-shrink-0">
                            {formatPosition(playStatus.position)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-4 p-4">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="px-3 py-1.5 rounded-full text-sm bg-gray-100 disabled:opacity-40"
                >
                  {t("common.previous")}
                </button>
                <span className="text-sm text-gray-500">
                  {t("listeningHistory.pageOf", { page, total: totalPages })}
                </span>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="px-3 py-1.5 rounded-full text-sm bg-gray-100 disabled:opacity-40"
                >
                  {t("common.next")}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
