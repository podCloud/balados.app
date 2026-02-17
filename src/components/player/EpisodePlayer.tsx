import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Play, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { marked } from "marked";
import { usePlayer } from "../../contexts";
import { PlayerControls } from "./PlayerControls";
import { DownloadButton } from "../ui/DownloadButton";

// Configure marked for safe output
marked.setOptions({
  breaks: true,
  gfm: true,
});

export const EpisodePlayer = () => {
  const { t } = useTranslation();
  const { currentEpisode, feedUrl } = usePlayer();
  const [showNotesOpen, setShowNotesOpen] = useState(false);

  const renderedNotes = useMemo(() => {
    if (!currentEpisode?.description) return "";
    return marked.parse(currentEpisode.description) as string;
  }, [currentEpisode?.description]);

  if (!currentEpisode) {
    return (
      <div className="h-full pb-16 flex items-center justify-center bg-white">
        <div className="text-center">
          <Play size={64} className="mx-auto mb-4 text-gray-300" aria-hidden="true" />
          <h2 className="text-xl font-semibold text-gray-700 mb-2">
            {t("player.title")}
          </h2>
          <p className="text-gray-400 text-sm">{t("player.selectEpisode")}</p>
        </div>
      </div>
    );
  }

  const hasShowNotes = renderedNotes.length > 0;

  return (
    <div className="h-full pb-16 flex flex-col bg-white overflow-y-auto">
      {/* Episode artwork */}
      <div className="flex-shrink-0 flex flex-col items-center justify-center p-8">
        <img
          src={
            currentEpisode.image ||
            'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="280" height="280"%3E%3Crect fill="%23e5e7eb" width="280" height="280"/%3E%3C/svg%3E'
          }
          alt={currentEpisode.title}
          className="w-full max-w-[280px] aspect-square rounded-xl shadow-lg"
        />
        {feedUrl && (
          <div className="mt-4">
            <DownloadButton
              episode={currentEpisode}
              feedUrl={feedUrl}
              size="md"
              showLabel
            />
          </div>
        )}
      </div>

      {/* Episode info */}
      <div className="flex-shrink-0 px-6 pb-4 text-center">
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

      {/* Show notes */}
      {hasShowNotes && (
        <div className="flex-shrink-0 border-t border-gray-200 mt-2">
          <button
            onClick={() => setShowNotesOpen(!showNotesOpen)}
            className="w-full flex items-center justify-between px-6 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            {t("player.showNotes")}
            {showNotesOpen ? (
              <ChevronUp size={18} className="text-gray-400" aria-hidden="true" />
            ) : (
              <ChevronDown size={18} className="text-gray-400" aria-hidden="true" />
            )}
          </button>
          {showNotesOpen && (
            <div className="px-6 pb-6">
              <div
                className="prose prose-sm max-w-none text-gray-700 [&_a]:text-blue-600 [&_a]:underline [&_img]:rounded-lg [&_img]:max-w-full [&_h1]:text-lg [&_h2]:text-base [&_h3]:text-sm [&_p]:mb-2 [&_ul]:mb-2 [&_ol]:mb-2 [&_li]:mb-0.5"
                dangerouslySetInnerHTML={{ __html: renderedNotes }}
              />
              {currentEpisode.link && (
                <a
                  href={currentEpisode.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 mt-4 text-sm text-blue-600 hover:text-blue-800"
                >
                  <ExternalLink size={14} aria-hidden="true" />
                  {t("player.seeOriginalPost")}
                </a>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
