import { useTranslation } from "react-i18next";
import { Search } from "lucide-react";

export const Explorer = () => {
  const { t } = useTranslation();

  return (
    <div className="h-full pb-16 flex items-center justify-center bg-white">
      <div className="text-center">
        <Search size={64} className="mx-auto mb-4 text-gray-300" />
        <h2 className="text-xl font-semibold text-gray-700 mb-2">
          {t("explorer.title")}
        </h2>
        <p className="text-gray-400 text-sm">{t("explorer.comingSoon")}</p>
      </div>
    </div>
  );
};
