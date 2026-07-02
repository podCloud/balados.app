import { useLiveQuery } from "dexie-react-hooks";
import { ChevronLeft, History as HistoryIcon } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { db } from "../../services/storage";
import { getAllPlayStatuses } from "../../services/storage/playStatus";
import { computeListeningStats, computeStreak } from "../../utils/listeningHistory";

interface ListeningHistoryProps {
  onBack: () => void;
}

const formatDuration = (totalSeconds: number): string => {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
};

export const ListeningHistory = ({ onBack }: ListeningHistoryProps) => {
  const { t } = useTranslation();
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

      <div className="flex-1 overflow-y-auto pb-16">
        {isLoading ? (
          <div className="p-8 text-center text-gray-500">{t("common.loading")}</div>
        ) : allPlayStatuses.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <HistoryIcon size={48} className="mx-auto mb-4 text-gray-300" aria-hidden="true" />
            <p>{t("listeningHistory.empty")}</p>
          </div>
        ) : (
          stats && (
            <div className="grid grid-cols-2 gap-3 p-4">
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="text-2xl font-bold text-blue-500">
                  {formatDuration(stats.totalTimeSeconds)}
                </div>
                <div className="text-sm text-gray-500 mt-1">{t("listeningHistory.totalTime")}</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="text-2xl font-bold text-gray-900">{stats.totalEpisodes}</div>
                <div className="text-sm text-gray-500 mt-1">
                  {t("listeningHistory.totalEpisodes")}
                </div>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="text-2xl font-bold text-green-500">{stats.completedCount}</div>
                <div className="text-sm text-gray-500 mt-1">{t("listeningHistory.completed")}</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="text-2xl font-bold text-orange-500">{stats.streakDays}</div>
                <div className="text-sm text-gray-500 mt-1">{t("listeningHistory.streak")}</div>
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
};
