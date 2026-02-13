import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Terminal, AlertCircle, AlertTriangle, Info } from "lucide-react";
import {
  getDebugLogs,
  clearDebugLogs,
  subscribeToDebugLogs,
} from "../../services/debug";
import type { DebugLog } from "../../types";

const getLogColor = (type: DebugLog["type"]) => {
  switch (type) {
    case "error":
      return "text-red-600 bg-red-50";
    case "warn":
      return "text-orange-600 bg-orange-50";
    default:
      return "text-gray-700 bg-white";
  }
};

const getLogIcon = (type: DebugLog["type"]) => {
  switch (type) {
    case "error":
      return <AlertCircle size={14} className="text-red-500" aria-hidden="true" />;
    case "warn":
      return <AlertTriangle size={14} className="text-orange-500" aria-hidden="true" />;
    default:
      return <Info size={14} className="text-blue-500" aria-hidden="true" />;
  }
};

export const Debug = () => {
  const { t } = useTranslation();
  const [logs, setLogs] = useState<DebugLog[]>(getDebugLogs);

  useEffect(() => {
    return subscribeToDebugLogs(setLogs);
  }, []);

  const handleClear = () => {
    clearDebugLogs();
  };

  return (
    <div className="h-full pb-16 flex flex-col bg-gray-900">
      <div className="bg-gray-800 px-4 py-3 flex items-center justify-between border-b border-gray-700">
        <h2 className="text-base font-semibold text-white">{t("debug.title")}</h2>
        <button
          onClick={handleClear}
          className="bg-red-600 text-white px-3 py-1 rounded text-xs font-medium hover:bg-red-700"
        >
          {t("debug.clear")}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1 font-mono text-xs">
        {logs.length === 0 ? (
          <div className="text-center text-gray-500 py-8">
            <Terminal size={32} className="mx-auto mb-2" aria-hidden="true" />
            <p>{t("debug.noLogs")}</p>
          </div>
        ) : (
          logs.map((log, idx) => (
            <div
              key={idx}
              className={`p-2 rounded border ${getLogColor(log.type)} border-gray-700`}
            >
              <div className="flex items-start gap-2">
                <span className="flex-shrink-0 mt-0.5">{getLogIcon(log.type)}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-gray-500 text-[10px] mb-1">
                    {log.timestamp}
                  </div>
                  <div className="whitespace-pre-wrap break-words">
                    {log.message}
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="bg-gray-800 px-4 py-2 border-t border-gray-700">
        <div className="text-xs text-gray-400 text-center">
          {t("debug.logCount", { count: logs.length })}
        </div>
      </div>
    </div>
  );
};
