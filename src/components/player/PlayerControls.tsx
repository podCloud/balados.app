import { useTranslation } from "react-i18next";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Loader2,
} from "lucide-react";
import { usePlayer } from "../../contexts";

const formatTime = (seconds: number): string => {
  if (!seconds || !isFinite(seconds)) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

export const PlayerControls = () => {
  const { t } = useTranslation();
  const {
    isPlaying,
    isLoading,
    currentTime,
    duration,
    pause,
    resume,
    seek,
    skipForward,
    skipBackward,
    playbackRate,
    setPlaybackRate,
  } = usePlayer();

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    seek(percent * duration);
  };

  const handleRateChange = () => {
    const currentIndex = PLAYBACK_RATES.indexOf(playbackRate);
    const nextIndex = (currentIndex + 1) % PLAYBACK_RATES.length;
    setPlaybackRate(PLAYBACK_RATES[nextIndex]);
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="px-4 py-4">
      {/* Progress bar */}
      <div
        className="h-1.5 bg-gray-200 rounded-full cursor-pointer mb-2"
        onClick={handleProgressClick}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") { e.preventDefault(); seek(Math.min(currentTime + 5, duration)); }
          if (e.key === "ArrowLeft") { e.preventDefault(); seek(Math.max(currentTime - 5, 0)); }
          if (e.key === "ArrowUp") { e.preventDefault(); seek(Math.min(currentTime + 30, duration)); }
          if (e.key === "ArrowDown") { e.preventDefault(); seek(Math.max(currentTime - 30, 0)); }
          if (e.key === "Home") { e.preventDefault(); seek(0); }
          if (e.key === "End") { e.preventDefault(); seek(duration); }
        }}
        role="slider"
        aria-orientation="horizontal"
        tabIndex={0}
        aria-label={t("player.progress")}
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(currentTime)}
        aria-valuetext={`${formatTime(currentTime)} / ${formatTime(duration)}`}
      >
        <div
          className="h-full bg-blue-500 rounded-full transition-all"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Time display */}
      <div className="flex justify-between text-xs text-gray-500 mb-4">
        <span>{formatTime(currentTime)}</span>
        <span>-{formatTime(duration - currentTime)}</span>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-6">
        {/* Skip backward */}
        <button
          onClick={() => skipBackward(15)}
          className="w-12 h-12 flex items-center justify-center text-gray-600 hover:text-gray-900"
          aria-label={t("player.skipBackward")}
        >
          <div className="relative">
            <SkipBack size={28} />
            <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 text-[10px] font-medium">
              15
            </span>
          </div>
        </button>

        {/* Play/Pause */}
        <button
          onClick={isPlaying ? pause : resume}
          disabled={isLoading}
          className="w-16 h-16 bg-blue-500 rounded-full flex items-center justify-center text-white hover:bg-blue-600 disabled:opacity-50"
          aria-label={isPlaying ? t("player.pause") : t("player.play")}
        >
          {isLoading ? (
            <Loader2 size={32} className="animate-spin" />
          ) : isPlaying ? (
            <Pause size={32} fill="currentColor" />
          ) : (
            <Play size={32} fill="currentColor" className="ml-1" />
          )}
        </button>

        {/* Skip forward */}
        <button
          onClick={() => skipForward(30)}
          className="w-12 h-12 flex items-center justify-center text-gray-600 hover:text-gray-900"
          aria-label={t("player.skipForward")}
        >
          <div className="relative">
            <SkipForward size={28} />
            <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 text-[10px] font-medium">
              30
            </span>
          </div>
        </button>
      </div>

      {/* Playback rate */}
      <div className="flex justify-center mt-4">
        <button
          onClick={handleRateChange}
          aria-label={t("player.playbackRate", { rate: playbackRate })}
          className="px-3 py-1 text-sm font-medium text-gray-600 bg-gray-100 rounded-full hover:bg-gray-200"
        >
          {playbackRate}x
        </button>
      </div>
    </div>
  );
};
