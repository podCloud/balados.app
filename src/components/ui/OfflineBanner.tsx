import { useTranslation } from "react-i18next";
import { WifiOff } from "lucide-react";
import { useOnline } from "../../hooks/useOnline";

export const OfflineBanner = () => {
  const { t } = useTranslation();
  const isOnline = useOnline();

  if (isOnline) return null;

  return (
    <div className="bg-amber-500 text-white text-sm py-2 px-4 flex items-center justify-center gap-2">
      <WifiOff size={16} />
      <span>{t("common.offline")}</span>
    </div>
  );
};
