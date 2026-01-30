import { useTranslation } from "react-i18next";
import { WifiOff, Clock, RefreshCw, AlertCircle, X } from "lucide-react";
import { useOnline } from "../../hooks/useOnline";
import { useSyncQueue } from "../../hooks/useSyncQueue";

export const OfflineBanner = () => {
  const { t } = useTranslation();
  const isOnline = useOnline();
  const { pendingCount, isSyncing, lastSyncError, clearError } = useSyncQueue();

  const showOffline = !isOnline;
  const showPending = pendingCount > 0;
  const showError = !!lastSyncError;

  if (!showOffline && !showPending && !showError) return null;

  return (
    <div className="text-white text-sm">
      {showError && (
        <div className="bg-red-500 py-2 px-4 flex items-center justify-center gap-2">
          <AlertCircle size={16} />
          <span>{t("sync.syncError")}: {lastSyncError}</span>
          <button
            onClick={clearError}
            className="ml-2 p-1 hover:bg-red-600 rounded"
            aria-label={t("common.cancel")}
          >
            <X size={14} />
          </button>
        </div>
      )}
      {(showOffline || showPending) && (
        <div className="bg-amber-500 py-2 px-4 flex items-center justify-center gap-4">
          {showOffline && (
            <div className="flex items-center gap-2">
              <WifiOff size={16} />
              <span>{t("common.offline")}</span>
            </div>
          )}
          {showPending && (
            <div className="flex items-center gap-2">
              {isSyncing ? (
                <RefreshCw size={16} className="animate-spin" />
              ) : (
                <Clock size={16} />
              )}
              <span>
                {isSyncing
                  ? t("sync.syncing")
                  : t("sync.pending", { count: pendingCount })}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
