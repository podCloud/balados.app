import { useTranslation } from "react-i18next";
import { Cloud, Loader2, AlertCircle } from "lucide-react";
import { useSync } from "../../hooks/useSync";

interface SyncStatusIconProps {
  onNavigate: (view: string) => void;
}

export const SyncStatusIcon = ({ onNavigate }: SyncStatusIconProps) => {
  const { t } = useTranslation();
  const { status, serverUrl, pendingCount } = useSync();

  if (!serverUrl) return null;

  const getAriaLabel = () => {
    switch (status) {
      case "connected":
        return t("sync.statusConnected");
      case "syncing":
        return t("sync.statusSyncing");
      case "pending":
        return t("sync.statusPending", { count: pendingCount });
      case "error":
        return t("sync.statusError");
      default:
        return t("sync.statusConnected");
    }
  };

  const renderIcon = () => {
    switch (status) {
      case "syncing":
        return <Loader2 size={18} className="text-blue-500 animate-spin" aria-hidden="true" />;
      case "error":
        return <AlertCircle size={18} className="text-red-500" aria-hidden="true" />;
      case "pending":
        return (
          <>
            <Cloud size={18} className="text-blue-500" aria-hidden="true" />
            {pendingCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 bg-blue-500 text-white text-[10px] font-medium rounded-full min-w-[16px] h-4 flex items-center justify-center px-1" aria-hidden="true">
                {pendingCount}
              </span>
            )}
          </>
        );
      default:
        return <Cloud size={18} className="text-green-500" aria-hidden="true" />;
    }
  };

  return (
    <button
      onClick={() => onNavigate("settings")}
      className="relative text-gray-500 w-8 h-8 flex items-center justify-center hover:bg-gray-100 rounded-lg"
      aria-label={getAriaLabel()}
    >
      {renderIcon()}
    </button>
  );
};
