import { useTranslation } from "react-i18next";
import { ChevronRight, Play, Pause } from "lucide-react";
import { usePlayer } from "../../contexts";
import { DownloadButton } from "../ui/DownloadButton";
import type { Episode } from "../../types";

interface EpisodeListProps {
  episodes: Episode[];
  feedUrl: string;
}

export const EpisodeList = ({ episodes, feedUrl }: EpisodeListProps) => {
  const { i18n } = useTranslation();
  const { play, pause, currentEpisode, isPlaying } = usePlayer();

  const handleClick = (episode: Episode) => {
    const episodeId = episode.guid || episode.enclosureUrl;
    const currentId = currentEpisode?.guid || currentEpisode?.enclosureUrl;

    if (currentId === episodeId && isPlaying) {
      pause();
    } else {
      play(episode, feedUrl);
    }
  };

  const isCurrentEpisode = (episode: Episode) => {
    const episodeId = episode.guid || episode.enclosureUrl;
    const currentId = currentEpisode?.guid || currentEpisode?.enclosureUrl;
    return currentId === episodeId;
  };

  return (
    <div className="divide-y divide-gray-200">
      {episodes.map((episode, idx) => {
        const isCurrent = isCurrentEpisode(episode);
        const isEpisodePlaying = isCurrent && isPlaying;

        return (
          <button
            key={episode.guid || idx}
            onClick={() => handleClick(episode)}
            className={`w-full text-left px-4 py-3 hover:bg-gray-50 active:bg-gray-100 ${
              isCurrent ? "bg-blue-50" : ""
            }`}
          >
            <div className="flex gap-3">
              <div className="relative flex-shrink-0">
                {episode.image ? (
                  <img
                    src={episode.image}
                    alt=""
                    className="w-14 h-14 rounded-lg"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-lg bg-gray-200" />
                )}
                <div
                  className={`absolute inset-0 flex items-center justify-center rounded-lg ${
                    isCurrent ? "bg-blue-500/80" : "bg-black/40 opacity-0 hover:opacity-100"
                  } transition-opacity`}
                >
                  {isEpisodePlaying ? (
                    <Pause size={24} className="text-white" fill="white" />
                  ) : (
                    <Play size={24} className="text-white ml-1" fill="white" />
                  )}
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <div
                  className={`font-medium text-sm mb-1 line-clamp-2 ${
                    isCurrent ? "text-blue-600" : "text-gray-900"
                  }`}
                >
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
              <div className="flex items-center gap-1 flex-shrink-0 self-center">
                <DownloadButton episode={episode} feedUrl={feedUrl} />
                <ChevronRight size={20} className="text-gray-400" />
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
};
