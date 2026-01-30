import { useTranslation } from "react-i18next";
import { Play } from "lucide-react";
import { usePlayer } from "../../contexts";
import { PlayerControls } from "./PlayerControls";

export const EpisodePlayer = () => {
  const { t } = useTranslation();
  const { currentEpisode } = usePlayer();

  if (!currentEpisode) {
    return (
      <div className="h-full pb-16 flex items-center justify-center bg-white">
        <div className="text-center">
          <Play size={64} className="mx-auto mb-4 text-gray-300" />
          <h2 className="text-xl font-semibold text-gray-700 mb-2">
            {t("player.title")}
          </h2>
          <p className="text-gray-400 text-sm">{t("player.selectEpisode")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full pb-16 flex flex-col bg-white">
      {/* Episode artwork */}
      <div className="flex-1 flex items-center justify-center p-8">
        <img
          src={
            currentEpisode.image ||
            'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="280" height="280"%3E%3Crect fill="%23e5e7eb" width="280" height="280"/%3E%3C/svg%3E'
          }
          alt={currentEpisode.title}
          className="w-full max-w-[280px] aspect-square rounded-xl shadow-lg"
        />
      </div>

      {/* Episode info */}
      <div className="px-6 pb-4 text-center">
        <h2 className="font-semibold text-lg text-gray-900 line-clamp-2 mb-1">
          {currentEpisode.title}
        </h2>
        {currentEpisode.pubDate && (
          <p className="text-sm text-gray-500">
            {new Date(currentEpisode.pubDate).toLocaleDateString()}
          </p>
        )}
      </div>

      {/* Player controls */}
      <PlayerControls />
    </div>
  );
};
