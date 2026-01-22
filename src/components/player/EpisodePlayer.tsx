import { useTranslation } from "react-i18next";
import { Play } from "lucide-react";

export const EpisodePlayer = () => {
  const { t } = useTranslation();

  return (
    <div className="h-full pb-16 flex items-center justify-center bg-white">
      <div className="text-center">
        <Play size={64} className="mx-auto mb-4 text-gray-300" />
        <h2 className="text-xl font-semibold text-gray-700 mb-2">
          {t("player.title")}
        </h2>
        <p className="text-gray-400 text-sm">{t("player.comingSoon")}</p>
      </div>
    </div>
  );
};
