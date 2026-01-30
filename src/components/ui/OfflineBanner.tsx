import { useTranslation } from "react-i18next";
import { WifiOff, Clock, RefreshCw } from "lucide-react";
import { useOnline } from "../../hooks/useOnline";
import { useSyncQueue } from "../../hooks/useSyncQueue";

export const OfflineBanner = () => {
  const { t } = useTranslation();
  const isOnline = useOnline();
  const { pendingCount, isSyncing } = useSyncQueue();

  const showOffline = !isOnline;
  const showPending = pendingCount > 0;

  if (!showOffline && !showPending) return null;

  return (
    <div className="bg-amber-500 text-white text-sm py-2 px-4 flex items-center justify-center gap-4">
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
  );
};
