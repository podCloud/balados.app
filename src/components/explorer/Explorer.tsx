import { useTranslation } from "react-i18next";
import { Trending } from "./Trending";

interface ExplorerProps {
  onNavigate: (view: string, feedUrl?: string | null) => void;
}

export const Explorer = ({ onNavigate }: ExplorerProps) => {
  const { t } = useTranslation();

  return (
    <div className="h-full pb-16 bg-white flex flex-col">
      <div className="px-4 py-3 border-b border-gray-200 flex-shrink-0">
        <h2 className="text-base font-semibold text-gray-900 text-center">
          {t("trending.title")}
        </h2>
      </div>
      <div className="flex-1 overflow-y-auto">
        <Trending onNavigate={onNavigate} />
      </div>
    </div>
  );
};
