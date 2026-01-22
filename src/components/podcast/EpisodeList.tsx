import { useTranslation } from "react-i18next";
import { ChevronRight } from "lucide-react";
import type { Episode } from "../../types";

interface EpisodeListProps {
  episodes: Episode[];
  onEpisodeSelect?: (episode: Episode) => void;
}

export const EpisodeList = ({ episodes, onEpisodeSelect }: EpisodeListProps) => {
  const { i18n } = useTranslation();

  const handleClick = (episode: Episode) => {
    if (onEpisodeSelect) {
      onEpisodeSelect(episode);
    } else {
      window.open(episode.enclosureUrl, "_blank");
    }
  };

  return (
    <div className="divide-y divide-gray-200">
      {episodes.map((episode, idx) => (
        <button
          key={episode.guid || idx}
          onClick={() => handleClick(episode)}
          className="w-full text-left px-4 py-3 hover:bg-gray-50 active:bg-gray-100"
        >
          <div className="flex gap-3">
            {episode.image && (
              <img
                src={episode.image}
                alt=""
                className="w-14 h-14 rounded-lg flex-shrink-0"
              />
            )}
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm text-gray-900 mb-1 line-clamp-2">
                {episode.title}
              </div>
              <div className="text-xs text-gray-500 line-clamp-2 mb-1">
                {episode.description}
              </div>
              <div className="flex gap-3 text-xs text-gray-400">
                {episode.duration && <span>{episode.duration}</span>}
                {episode.pubDate && (
                  <span>
                    {new Date(episode.pubDate).toLocaleDateString(i18n.language, {
                      day: "numeric",
                      month: "short",
                    })}
                  </span>
                )}
              </div>
            </div>
            <ChevronRight
              size={20}
              className="text-gray-400 flex-shrink-0 self-center"
            />
          </div>
        </button>
      ))}
    </div>
  );
};
