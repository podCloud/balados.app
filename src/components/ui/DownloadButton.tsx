import { Download, Loader2, Check, Trash2, AlertCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useDownload } from "../../contexts";
import type { Episode } from "../../types";
import { getEpisodeId } from "../../services/storage/downloads";

interface DownloadButtonProps {
  episode: Episode;
  feedUrl: string;
  size?: "sm" | "md";
  showLabel?: boolean;
}

export const DownloadButton = ({
  episode,
  feedUrl,
  size = "sm",
  showLabel = false,
}: DownloadButtonProps) => {
  const { t } = useTranslation();
  const { isDownloaded, isDownloading, getProgress, download, deleteDownload } =
    useDownload();

  const episodeId = getEpisodeId(episode);
  const downloaded = isDownloaded(episodeId);
  const downloading = isDownloading(episodeId);
  const progress = getProgress(episodeId);

  const iconSize = size === "sm" ? 18 : 22;
  const buttonClass =
    size === "sm"
      ? "p-1.5 rounded-full"
      : "p-2 rounded-lg";

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();

    if (downloading) return;

    if (downloaded) {
      if (window.confirm(t("downloads.deleteConfirm"))) {
        await deleteDownload(episodeId);
      }
    } else {
      await download(episode, feedUrl);
    }
  };

  // Error state
  if (progress?.status === "error") {
    return (
      <button
        onClick={handleClick}
        className={`${buttonClass} bg-red-100 text-red-600 hover:bg-red-200`}
        title={progress.error || t("downloads.error")}
        aria-label={t("downloads.retryDownload")}
      >
        <AlertCircle size={iconSize} />
        {showLabel && (
          <span className="ml-2 text-sm">{t("downloads.error")}</span>
        )}
      </button>
    );
  }

  // Downloading state
  if (downloading) {
    return (
      <button
        className={`${buttonClass} bg-blue-100 text-blue-600 cursor-wait relative`}
        disabled
        aria-label={t("downloads.downloading")}
      >
        <Loader2 size={iconSize} className="animate-spin" />
        {progress && progress.percent > 0 && (
          <span className="absolute -bottom-1 -right-1 text-[10px] font-medium bg-blue-600 text-white rounded px-1">
            {progress.percent}%
          </span>
        )}
        {showLabel && (
          <span className="ml-2 text-sm">{t("downloads.downloading")}</span>
        )}
      </button>
    );
  }

  // Downloaded state
  if (downloaded) {
    return (
      <button
        onClick={handleClick}
        className={`${buttonClass} bg-green-100 text-green-600 hover:bg-red-100 hover:text-red-600 group`}
        title={t("downloads.delete")}
        aria-label={t("downloads.downloaded")}
      >
        <Check size={iconSize} className="group-hover:hidden" />
        <Trash2 size={iconSize} className="hidden group-hover:block" />
        {showLabel && (
          <span className="ml-2 text-sm group-hover:hidden">
            {t("downloads.downloaded")}
          </span>
        )}
      </button>
    );
  }

  // Default: not downloaded
  return (
    <button
      onClick={handleClick}
      className={`${buttonClass} bg-gray-100 text-gray-600 hover:bg-blue-100 hover:text-blue-600`}
      title={t("downloads.download")}
      aria-label={t("downloads.download")}
    >
      <Download size={iconSize} />
      {showLabel && (
        <span className="ml-2 text-sm">{t("downloads.download")}</span>
      )}
    </button>
  );
};
