import { useLiveQuery } from "dexie-react-hooks";
import { ChevronLeft, History as HistoryIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { getAllPlayStatuses } from "../../services/storage/playStatus";

interface ListeningHistoryProps {
  onBack: () => void;
}

export const ListeningHistory = ({ onBack }: ListeningHistoryProps) => {
  const { t } = useTranslation();

  const allPlayStatuses = useLiveQuery(() => getAllPlayStatuses(), []);
  const isLoading = allPlayStatuses === undefined;

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

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-8 text-center text-gray-500">{t("common.loading")}</div>
        ) : allPlayStatuses.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <HistoryIcon size={48} className="mx-auto mb-4 text-gray-300" aria-hidden="true" />
            <p>{t("listeningHistory.empty")}</p>
          </div>
        ) : (
          <div className="p-8 text-center text-gray-400">{allPlayStatuses.length} entries</div>
        )}
      </div>
    </div>
  );
};
