import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Trash2, HardDrive } from "lucide-react";
import { useDownload } from "../../contexts";
import { getStorageQuota, getDownloadsSize } from "../../services/storage/downloads";

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

export const StorageSettings = () => {
  const { t } = useTranslation();
  const { downloads, deleteDownload, clearAllDownloads } = useDownload();
  const [quota, setQuota] = useState({ used: 0, available: 0, total: 0 });
  const [downloadsSize, setDownloadsSize] = useState(0);

  useEffect(() => {
    const loadQuota = async () => {
      const q = await getStorageQuota();
      setQuota(q);
      const size = await getDownloadsSize();
      setDownloadsSize(size);
    };
    loadQuota();
  }, [downloads]);

  const downloadList = Array.from(downloads.values());
  const hasQuotaInfo = quota.total > 0;
  const usagePercent = hasQuotaInfo
    ? Math.round((quota.used / quota.total) * 100)
    : 0;

  const handleClearAll = async () => {
    if (window.confirm(t("downloads.clearAllConfirm"))) {
      await clearAllDownloads();
    }
  };

  const handleDelete = async (episodeId: string) => {
    if (window.confirm(t("downloads.deleteConfirm"))) {
      await deleteDownload(episodeId);
    }
  };

  return (
    <div className="mt-6">
      <h2 className="px-4 text-sm font-medium text-gray-500 uppercase tracking-wide mb-2">
        {t("downloads.storage")}
      </h2>

      <div className="bg-white border-y border-gray-100">
        {/* Storage quota bar */}
        <div className="px-4 py-3">
          <div className="flex items-center gap-3 mb-2">
            <HardDrive size={20} className="text-gray-400" />
            <div className="flex-1">
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-700">
                  {t("downloads.downloaded")}
                </span>
                <span className="text-gray-500">
                  {formatFileSize(downloadsSize)}
                </span>
              </div>
              {hasQuotaInfo && (
                <>
                  <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all"
                      style={{ width: `${usagePercent}%` }}
                    />
                  </div>
                  <div className="text-xs text-gray-400 mt-1">
                    {t("downloads.used", {
                      size: formatFileSize(quota.used),
                    })}{" "}
                    / {formatFileSize(quota.total)}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Download count and clear all */}
        {downloadList.length > 0 && (
          <div className="px-4 py-2 border-t border-gray-100 flex justify-between items-center">
            <span className="text-sm text-gray-600">
              {t("downloads.episodeCount", { count: downloadList.length })}
            </span>
            <button
              onClick={handleClearAll}
              className="text-sm text-red-500 hover:text-red-600 flex items-center gap-1"
            >
              <Trash2 size={14} />
              {t("downloads.clearAll")}
            </button>
          </div>
        )}
      </div>

      {/* Downloaded episodes list */}
      {downloadList.length > 0 && (
        <div className="mt-2 bg-white border-y border-gray-100">
          {downloadList.map((download) => (
            <div
              key={download.episodeId}
              className="px-4 py-3 border-b border-gray-50 last:border-b-0 flex justify-between items-center"
            >
              <div className="flex-1 min-w-0 mr-3">
                <p className="text-sm text-gray-900 truncate">{download.title}</p>
                <p className="text-xs text-gray-400">
                  {formatFileSize(download.fileSize)} -{" "}
                  {new Date(download.downloadedAt).toLocaleDateString()}
                </p>
              </div>
              <button
                onClick={() => handleDelete(download.episodeId)}
                className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full"
              >
                <Trash2 size={18} />
              </button>
            </div>
          ))}
        </div>
      )}

      {downloadList.length === 0 && (
        <div className="px-4 py-6 text-center text-gray-400 text-sm">
          {t("downloads.noDownloads")}
        </div>
      )}
    </div>
  );
};
