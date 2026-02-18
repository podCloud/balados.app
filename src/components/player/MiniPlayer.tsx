import { Pause, Play } from "lucide-react";
import { useTranslation } from "react-i18next";
import { usePlayer } from "../../contexts";

interface MiniPlayerProps {
  onExpand: () => void;
}

export const MiniPlayer = ({ onExpand }: MiniPlayerProps) => {
  const { t } = useTranslation();
  const { currentEpisode, isPlaying, isLoading, pause, resume, currentTime, duration } =
    usePlayer();

  if (!currentEpisode) return null;

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  const handlePlayPause = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isPlaying) {
      pause();
    } else {
      resume();
    }
  };

  return (
    <button
      type="button"
      onClick={onExpand}
      aria-label={t("player.expandPlayer")}
      className="fixed bottom-16 left-0 right-0 bg-white border-t border-gray-200 cursor-pointer hover:bg-gray-50 active:bg-gray-100 safe-area-inset-bottom w-full text-left appearance-none p-0"
    >
      {/* Progress bar */}
      <div className="h-0.5 bg-gray-200">
        <div className="h-full bg-blue-500 transition-all" style={{ width: `${progress}%` }} />
      </div>

      <div className="max-w-md mx-auto flex items-center px-4 py-2 gap-3">
        {/* Episode image */}
        <img
          src={
            currentEpisode.image ||
            'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="40" height="40"%3E%3Crect fill="%23e5e7eb" width="40" height="40"/%3E%3C/svg%3E'
          }
          alt=""
          className="w-10 h-10 rounded-md flex-shrink-0"
        />

        {/* Episode title */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{currentEpisode.title}</p>
        </div>

        {/* Play/Pause button */}
        <button
          type="button"
          onClick={handlePlayPause}
          disabled={isLoading}
          aria-label={isPlaying ? t("player.pause") : t("player.play")}
          className="w-10 h-10 flex items-center justify-center text-blue-500 hover:text-blue-600"
        >
          {isLoading ? (
            <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          ) : isPlaying ? (
            <Pause size={24} fill="currentColor" />
          ) : (
            <Play size={24} fill="currentColor" className="ml-0.5" />
          )}
        </button>
      </div>
    </button>
  );
};
