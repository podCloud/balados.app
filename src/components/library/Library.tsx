import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useTranslation } from "react-i18next";
import { Plus, X, Headphones, Settings, Clock } from "lucide-react";
import { db } from "../../services/storage";
import { addSubscription } from "../../services/storage/subscriptions";
import { getInProgressEpisodes } from "../../services/storage/playStatus";
import { getHiddenEpisodes } from "../../services/storage/hiddenEpisodes";
import { SubscriptionItem } from "./SubscriptionItem";

interface LibraryProps {
  onNavigate: (view: string, feedUrl?: string | null) => void;
}

const DEFAULT_FEED = "https://decouvrez.lepodcast.fr/rss";

export const Library = ({ onNavigate }: LibraryProps) => {
  const { t } = useTranslation();
  const [showAddForm, setShowAddForm] = useState(false);
  const [newFeedUrl, setNewFeedUrl] = useState("");

  const subscriptions = useLiveQuery(
    () => db.subscriptions.orderBy("addedAt").reverse().toArray(),
    []
  );

  // Count in-progress episodes (excluding hidden)
  // Note: This uses useLiveQuery which reacts to IndexedDB changes, but hidden episodes
  // are stored in localStorage. The count won't update immediately when hiding from
  // InProgress page until the next DB change. This is an acceptable UX tradeoff.
  const inProgressCount = useLiveQuery(
    async () => {
      const episodes = await getInProgressEpisodes();
      const hidden = getHiddenEpisodes();
      return episodes.filter((e) => !hidden.has(e.episodeId)).length;
    },
    []
  );

  // Initialize with default subscription if empty
  useLiveQuery(async () => {
    const count = await db.subscriptions.count();
    if (count === 0) {
      await addSubscription(DEFAULT_FEED);
    }
  }, []);

  const handleSubscribe = async (
    e?: React.FormEvent | React.KeyboardEvent | React.MouseEvent
  ) => {
    if (e) e.preventDefault();
    if (!newFeedUrl.trim()) return;

    await addSubscription(newFeedUrl.trim());
    setNewFeedUrl("");
    setShowAddForm(false);
  };

  return (
    <div className="h-full pb-16">
      <div className="bg-white h-full">
        <div className="flex justify-between items-center px-4 py-3 border-b border-gray-200">
          <button
            onClick={() => onNavigate("settings")}
            className="text-gray-500 w-8 h-8 flex items-center justify-center"
          >
            <Settings size={22} />
          </button>
          <h2 className="text-base font-semibold text-gray-900">
            {t("library.title")}
          </h2>
          <div className="flex items-center gap-1">
            {(inProgressCount ?? 0) > 0 && (
              <button
                onClick={() => onNavigate("inProgress")}
                className="relative text-gray-500 w-8 h-8 flex items-center justify-center hover:bg-gray-100 rounded-lg"
                title={t("inProgress.title")}
                aria-label={`${t("inProgress.title")} (${inProgressCount})`}
              >
                <Clock size={20} />
                <span className="absolute -top-0.5 -right-0.5 bg-blue-500 text-white text-[10px] font-medium rounded-full min-w-[16px] h-4 flex items-center justify-center px-1" aria-hidden="true">
                  {inProgressCount}
                </span>
              </button>
            )}
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="text-blue-500 w-8 h-8 flex items-center justify-center"
            >
              {showAddForm ? <X size={24} /> : <Plus size={24} />}
            </button>
          </div>
        </div>

        {showAddForm && (
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
            <input
              type="url"
              value={newFeedUrl}
              onChange={(e) => setNewFeedUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleSubscribe(e);
                }
              }}
              placeholder={t("library.feedUrl")}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={handleSubscribe}
              className="w-full bg-blue-500 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-600 mb-2"
            >
              {t("library.subscribe")}
            </button>
            <p className="text-xs text-gray-500 text-center">
              {t("debug.title")}
            </p>
          </div>
        )}

        {!subscriptions || subscriptions.length === 0 ? (
          <div className="flex items-center justify-center h-64 text-gray-400">
            <div className="text-center">
              <Headphones size={48} className="mx-auto mb-3" />
              <p className="text-sm">{t("library.empty")}</p>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {subscriptions.map((sub) => (
              <SubscriptionItem
                key={sub.url}
                url={sub.url}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
