import { useTranslation } from "react-i18next";
import { ArrowLeft, Check } from "lucide-react";
import { StorageSettings } from "./StorageSettings";

interface SettingsProps {
  onBack: () => void;
}

const LANGUAGES = [
  { code: "fr", name: "Français" },
  { code: "en", name: "English" },
];

export const Settings = ({ onBack }: SettingsProps) => {
  const { t, i18n } = useTranslation();

  const handleLanguageChange = (langCode: string) => {
    i18n.changeLanguage(langCode);
    localStorage.setItem("i18nextLng", langCode);
  };

  return (
    <div className="h-full pb-16 flex flex-col bg-white">
      {/* Header */}
      <div className="flex items-center px-4 py-3 border-b border-gray-200">
        <button
          onClick={onBack}
          className="flex items-center text-blue-500 -ml-2 px-2 py-1"
        >
          <ArrowLeft size={20} />
          <span className="ml-1">{t("settings.back")}</span>
        </button>
        <h1 className="flex-1 text-center font-semibold text-lg pr-8">
          {t("settings.title")}
        </h1>
      </div>

      {/* Settings content */}
      <div className="flex-1 overflow-y-auto">
        {/* Language section */}
        <div className="mt-4">
          <h2 className="px-4 text-sm font-medium text-gray-500 uppercase tracking-wide mb-2">
            {t("settings.language")}
          </h2>
          <div className="bg-white">
            {LANGUAGES.map((lang) => (
              <button
                key={lang.code}
                onClick={() => handleLanguageChange(lang.code)}
                className="w-full flex items-center justify-between px-4 py-3 border-b border-gray-100 hover:bg-gray-50"
              >
                <span className="text-gray-900">{lang.name}</span>
                {i18n.language === lang.code && (
                  <Check size={20} className="text-blue-500" />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Storage section */}
        <StorageSettings />

        {/* About section */}
        <div className="mt-6">
          <h2 className="px-4 text-sm font-medium text-gray-500 uppercase tracking-wide mb-2">
            {t("settings.about")}
          </h2>
          <div className="bg-white px-4 py-3 border-y border-gray-100">
            <p className="text-sm text-gray-600">
              <strong>Balados</strong> - {t("settings.description")}
            </p>
            <p className="text-xs text-gray-400 mt-2">
              {t("settings.version")} 0.1.0
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
