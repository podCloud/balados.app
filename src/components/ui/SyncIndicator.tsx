import { useTranslation } from "react-i18next";
import { useSyncQueue } from "../../hooks/useSyncQueue";

export const SyncIndicator = () => {
  const { t } = useTranslation();
  const { pendingCount, isSyncing } = useSyncQueue();

  if (pendingCount === 0) return null;

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-100 text-amber-800 text-sm rounded-full">
      {isSyncing ? (
        <>
          <svg
            className="w-4 h-4 animate-spin"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          <span>{t("sync.syncing")}</span>
        </>
      ) : (
        <>
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span>{t("sync.pending", { count: pendingCount })}</span>
        </>
      )}
    </div>
  );
};
