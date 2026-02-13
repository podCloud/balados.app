import { useTranslation } from "react-i18next";
import { Library, Play, Search, Bug } from "lucide-react";
import type { TabId } from "../../types";

interface TabBarProps {
  activeTab: TabId;
  onTabChange: (tabId: TabId) => void;
}

const tabs: { id: TabId; icon: typeof Library; labelKey: string }[] = [
  { id: "library", icon: Library, labelKey: "tabs.library" },
  { id: "player", icon: Play, labelKey: "tabs.player" },
  { id: "explorer", icon: Search, labelKey: "tabs.explorer" },
  ...(import.meta.env.DEV
    ? [{ id: "debug" as TabId, icon: Bug, labelKey: "tabs.debug" }]
    : []),
];

export const TabBar = ({ activeTab, onTabChange }: TabBarProps) => {
  const { t } = useTranslation();

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 safe-area-inset-bottom">
      <div className="max-w-md mx-auto flex">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`flex-1 py-2 flex flex-col items-center gap-1 transition-colors ${
                activeTab === tab.id ? "text-blue-500" : "text-gray-400"
              }`}
            >
              <Icon size={24} />
              <span className="text-xs font-medium">{t(tab.labelKey)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
