import React, { useState, useEffect } from "react";

// Debug logs storage
type DebugLog = {
  type: "log" | "error" | "warn";
  message: string;
  timestamp: string;
};
const debugLogs = [] as DebugLog[];
const debugListeners = new Set<(logs: DebugLog[]) => void>();

const addDebugLog = (
  type: "log" | "error" | "warn",
  ...args: Array<unknown>
) => {
  const timestamp = new Date().toLocaleTimeString("fr-FR");
  const message = args
    .map((arg) =>
      typeof arg === "object" ? JSON.stringify(arg, null, 2) : String(arg),
    )
    .join(" ");

  debugLogs.push({ type, message, timestamp });
  if (debugLogs.length > 100) debugLogs.shift(); // Keep last 100 logs

  debugListeners.forEach((listener) => listener([...debugLogs]));
};

// Override console methods
const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;

console.log = (...args) => {
  originalLog(...args);
  addDebugLog("log", ...args);
};

console.error = (...args) => {
  originalError(...args);
  addDebugLog("error", ...args);
};

console.warn = (...args) => {
  originalWarn(...args);
  addDebugLog("warn", ...args);
};

// Mock React Query - Simple cache implementation
const queryCache = new Map();

const useQuery = (key, fetchFn, options = {}) => {
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const cacheKey = JSON.stringify(key);

  const fetchData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Check cache first
      if (queryCache.has(cacheKey)) {
        const cached = queryCache.get(cacheKey);
        setData(cached);
        setIsLoading(false);
        return;
      }

      const result = await fetchFn();
      queryCache.set(cacheKey, result);
      setData(result);
    } catch (err) {
      console.error("Query error:", err);
      setError(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [cacheKey]);

  return { data, isLoading, error, refetch: fetchData };
};

// Utility functions for localStorage
const STORAGE_KEY = "podcast_subscriptions";

const getSubscriptions = () => {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored ? JSON.parse(stored) : [];
};

const saveSubscriptions = (subs) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(subs));
};

const getFeedCache = (url) => {
  const cached = localStorage.getItem(`feed_${url}`);
  if (!cached) return null;
  const data = JSON.parse(cached);
  const isExpired = Date.now() - data.timestamp > 1000 * 60 * 30;
  return isExpired ? null : data.feed;
};

const saveFeedCache = (url, feed) => {
  localStorage.setItem(
    `feed_${url}`,
    JSON.stringify({
      feed,
      timestamp: Date.now(),
    }),
  );
};

// Parse RSS feed
const parseRSS = async (url) => {
  const cached = getFeedCache(url);
  if (cached) return cached;

  try {
    let response;
    let text;

    // Try direct fetch first
    try {
      console.log(`Tentative directe sans proxy: ${url}`);
      response = await fetch(url);
      if (response.ok) {
        text = await response.text();
        console.log("✅ Succès en direct sans proxy!");
      }
    } catch (e) {
      console.log("❌ Échec en direct:", e.message);
    }

    // If direct fetch failed, try CORS proxies
    if (!text) {
      const proxies = [
        "https://api.allorigins.win/raw?url=",
        "https://corsproxy.io/?",
        "https://cors-anywhere.herokuapp.com/",
      ];

      for (const proxy of proxies) {
        try {
          console.log(`Tentative avec proxy ${proxy}`);
          response = await fetch(proxy + encodeURIComponent(url));
          if (response.ok) {
            text = await response.text();
            console.log("✅ Succès avec", proxy);
            break;
          }
        } catch (e) {
          console.log(`❌ Échec avec ${proxy}:`, e.message);
          continue;
        }
      }
    }

    if (!text) {
      throw new Error("Impossible de récupérer le flux RSS");
    }

    const parser = new DOMParser();
    const xml = parser.parseFromString(text, "text/xml");

    const getElementText = (parent, tag) => {
      const el = parent.querySelector(tag);
      return el ? el.textContent : "";
    };

    const channel = xml.querySelector("channel");
    if (!channel) {
      throw new Error("Format RSS invalide");
    }

    const title = getElementText(channel, "title");
    const description = getElementText(channel, "description");
    const image =
      channel.querySelector("image url")?.textContent ||
      channel.querySelector("itunes\\:image")?.getAttribute("href") ||
      "";

    const items = Array.from(xml.querySelectorAll("item")).map((item) => {
      const enclosure = item.querySelector("enclosure");
      const duration = getElementText(item, "itunes\\:duration");
      const itemImage =
        item.querySelector("itunes\\:image")?.getAttribute("href") || image;

      return {
        title: getElementText(item, "title"),
        description: getElementText(item, "description")
          .replace(/<[^>]*>/g, "")
          .substring(0, 200),
        pubDate: getElementText(item, "pubDate"),
        enclosureUrl: enclosure?.getAttribute("url") || "",
        duration: duration || "",
        image: itemImage,
      };
    });

    const feed = { title, description, image, items, url };
    saveFeedCache(url, feed);
    console.log("Feed parsé avec succès:", title, items.length, "épisodes");
    return feed;
  } catch (error) {
    console.error("Erreur lors du parsing RSS:", error);
    throw error;
  }
};

// Library: List of subscriptions
const Library = ({ onNavigate }) => {
  // Initialize with default podcast if no subscriptions exist
  useEffect(() => {
    const subs = getSubscriptions();
    if (subs.length === 0) {
      const defaultSub = {
        url: "https://decouvrez.lepodcast.fr/rss",
        addedAt: Date.now(),
      };
      saveSubscriptions([defaultSub]);
      setSubscriptions([defaultSub]);
    }
  }, []);

  const [subscriptions, setSubscriptions] = useState(getSubscriptions());
  const [showAddForm, setShowAddForm] = useState(false);
  const [newFeedUrl, setNewFeedUrl] = useState("");

  const handleSubscribe = (e) => {
    if (e) e.preventDefault();
    if (!newFeedUrl.trim()) return;

    const subs = getSubscriptions();
    if (!subs.find((s) => s.url === newFeedUrl)) {
      const updated = [...subs, { url: newFeedUrl, addedAt: Date.now() }];
      saveSubscriptions(updated);
      setSubscriptions(updated);
    }
    setNewFeedUrl("");
    setShowAddForm(false);
  };

  return (
    <div className="h-full pb-16">
      <div className="bg-white h-full">
        <div className="flex justify-between items-center px-4 py-3 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">Podcasts</h2>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="text-blue-500 text-2xl font-light w-8 h-8 flex items-center justify-center"
          >
            {showAddForm ? "×" : "+"}
          </button>
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
              placeholder="URL du flux RSS"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={handleSubscribe}
              className="w-full bg-blue-500 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-600 mb-2"
            >
              S'abonner
            </button>
            <p className="text-xs text-gray-500 text-center">
              💡 Consultez l'onglet Debug 🐛 pour voir les logs
            </p>
          </div>
        )}

        {subscriptions.length === 0 ? (
          <div className="flex items-center justify-center h-64 text-gray-400">
            <div className="text-center">
              <div className="text-5xl mb-3">🎧</div>
              <p className="text-sm">Aucun podcast</p>
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

const SubscriptionItem = ({ url, onNavigate }) => {
  const {
    data: feed,
    isLoading,
    error,
  } = useQuery(["feed", url], () => parseRSS(url));

  const handleUnsubscribe = () => {
    if (window.confirm(`Se désabonner de "${feed?.title || "ce podcast"}" ?`)) {
      const subs = getSubscriptions().filter((s) => s.url !== url);
      saveSubscriptions(subs);
      localStorage.removeItem(`feed_${url}`);
      queryCache.delete(JSON.stringify(["feed", url]));
      window.location.reload();
    }
  };

  // Always display the item, even while loading
  const displayTitle =
    feed?.title ||
    url.replace("https://", "").replace("http://", "").split("/")[0];
  const displayImage =
    feed?.image ||
    'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="56" height="56"%3E%3Crect fill="%23ddd" width="56" height="56"/%3E%3Ctext x="50%25" y="50%25" text-anchor="middle" dy=".3em" fill="%23999" font-size="24"%3E🎧%3C/text%3E%3C/svg%3E';
  const episodeCount = feed?.items?.length || 0;

  if (error) {
    return (
      <div className="flex items-center px-4 py-3 bg-red-50 border-b border-red-100">
        <div className="w-14 h-14 bg-red-200 rounded-lg flex items-center justify-center text-2xl">
          ⚠️
        </div>
        <div className="ml-3 flex-1 min-w-0">
          <div className="text-sm font-medium text-red-900 truncate">
            {displayTitle}
          </div>
          <div className="text-xs text-red-600">Erreur de chargement</div>
        </div>
        <button
          onClick={handleUnsubscribe}
          className="ml-2 text-red-500 text-xl px-2"
        >
          ×
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => (feed ? onNavigate("podcast", url) : null)}
      disabled={isLoading}
      className={`w-full flex items-center px-4 py-3 bg-white hover:bg-gray-50 active:bg-gray-100 ${isLoading ? "opacity-60" : ""}`}
    >
      <div className="relative">
        <img
          src={displayImage}
          alt={displayTitle}
          className="w-14 h-14 rounded-lg"
        />
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-50 rounded-lg">
            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        )}
      </div>
      <div className="ml-3 text-left flex-1 min-w-0">
        <div className="font-medium text-sm text-gray-900 truncate">
          {displayTitle}
          {isLoading && (
            <span className="text-gray-400 ml-2">Chargement...</span>
          )}
        </div>
        <div className="text-xs text-gray-500 mt-0.5">
          {isLoading
            ? "Récupération des épisodes..."
            : `${episodeCount} épisode${episodeCount > 1 ? "s" : ""}`}
        </div>
      </div>
      {!isLoading && <div className="text-gray-400 text-xl ml-2">›</div>}
    </button>
  );
};

// Podcast Detail: List of episodes
const PodcastDetail = ({ feedUrl, onNavigate }) => {
  const {
    data: feed,
    isLoading,
    error,
    refetch,
  } = useQuery(["feed", feedUrl], () => parseRSS(feedUrl));

  const handleRefresh = () => {
    localStorage.removeItem(`feed_${feedUrl}`);
    queryCache.delete(JSON.stringify(["feed", feedUrl]));
    refetch();
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <div className="text-5xl mb-4 animate-bounce">🎧</div>
          <div className="text-gray-500 text-sm">Chargement...</div>
        </div>
      </div>
    );
  }

  if (error || !feed) {
    return (
      <div className="h-full flex flex-col">
        <div className="bg-blue-500 px-4 py-3 flex items-center gap-3 shadow-sm">
          <button
            onClick={() => onNavigate("library")}
            className="text-white text-base flex items-center gap-1"
          >
            <span className="text-xl">‹</span>
            <span>Bibliothèque</span>
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center">
            <div className="text-5xl mb-4">⚠️</div>
            <h2 className="text-lg font-semibold text-gray-700 mb-2">
              Erreur de chargement
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              Impossible de charger ce podcast
            </p>
            <button
              onClick={handleRefresh}
              className="bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium"
            >
              Réessayer
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full pb-16 flex flex-col">
      <div className="bg-blue-500 px-4 py-3 flex items-center gap-3 shadow-sm">
        <button
          onClick={() => onNavigate("library")}
          className="text-white text-base flex items-center gap-1"
        >
          <span className="text-xl">‹</span>
          <span>Bibliothèque</span>
        </button>
        <button onClick={handleRefresh} className="ml-auto text-white text-sm">
          ↻ MAJ
        </button>
      </div>

      <div className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="flex gap-4">
          <img
            src={
              feed.image ||
              'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="80" height="80"%3E%3Crect fill="%23ddd" width="80" height="80"/%3E%3C/svg%3E'
            }
            alt={feed.title}
            className="w-20 h-20 rounded-lg shadow-sm"
          />
          <div className="flex-1 min-w-0">
            <h1 className="font-semibold text-base text-gray-900 mb-1">
              {feed.title}
            </h1>
            <p className="text-xs text-gray-500 line-clamp-3">
              {feed.description}
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto divide-y divide-gray-200">
        {feed.items.map((episode, idx) => (
          <button
            key={idx}
            onClick={() => window.open(episode.enclosureUrl, "_blank")}
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
                      {new Date(episode.pubDate).toLocaleDateString("fr-FR", {
                        day: "numeric",
                        month: "short",
                      })}
                    </span>
                  )}
                </div>
              </div>
              <div className="text-gray-400 text-xl flex-shrink-0 self-center">
                ›
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

// Player placeholder
const Player = () => {
  return (
    <div className="h-full pb-16 flex items-center justify-center bg-white">
      <div className="text-center">
        <div className="text-6xl mb-4">▶️</div>
        <h2 className="text-xl font-semibold text-gray-700 mb-2">Lecteur</h2>
        <p className="text-gray-400 text-sm">Bientôt disponible</p>
      </div>
    </div>
  );
};

// Explorer placeholder
const Explorer = () => {
  return (
    <div className="h-full pb-16 flex items-center justify-center bg-white">
      <div className="text-center">
        <div className="text-6xl mb-4">🔍</div>
        <h2 className="text-xl font-semibold text-gray-700 mb-2">Explorer</h2>
        <p className="text-gray-400 text-sm">Bientôt disponible</p>
      </div>
    </div>
  );
};

// Debug console
const Debug = () => {
  const [logs, setLogs] = useState([...debugLogs]);

  useEffect(() => {
    const listener = (newLogs) => setLogs(newLogs);
    debugListeners.add(listener);
    return () => debugListeners.delete(listener);
  }, []);

  const clearLogs = () => {
    debugLogs.length = 0;
    setLogs([]);
  };

  const getLogColor = (type) => {
    switch (type) {
      case "error":
        return "text-red-600 bg-red-50";
      case "warn":
        return "text-orange-600 bg-orange-50";
      default:
        return "text-gray-700 bg-white";
    }
  };

  const getLogIcon = (type) => {
    switch (type) {
      case "error":
        return "❌";
      case "warn":
        return "⚠️";
      default:
        return "📝";
    }
  };

  return (
    <div className="h-full pb-16 flex flex-col bg-gray-900">
      <div className="bg-gray-800 px-4 py-3 flex items-center justify-between border-b border-gray-700">
        <h2 className="text-base font-semibold text-white">Console Debug</h2>
        <button
          onClick={clearLogs}
          className="bg-red-600 text-white px-3 py-1 rounded text-xs font-medium hover:bg-red-700"
        >
          Effacer
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1 font-mono text-xs">
        {logs.length === 0 ? (
          <div className="text-center text-gray-500 py-8">
            <div className="text-3xl mb-2">🐛</div>
            <p>Aucun log pour le moment</p>
          </div>
        ) : (
          logs.map((log, idx) => (
            <div
              key={idx}
              className={`p-2 rounded border ${getLogColor(log.type)} border-gray-700`}
            >
              <div className="flex items-start gap-2">
                <span className="flex-shrink-0">{getLogIcon(log.type)}</span>
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
          {logs.length} log{logs.length > 1 ? "s" : ""} enregistré
          {logs.length > 1 ? "s" : ""}
        </div>
      </div>
    </div>
  );
};

// Tab Bar
const TabBar = ({ activeTab, onTabChange }) => {
  const tabs = [
    { id: "library", label: "Bibliothèque", icon: "📚" },
    { id: "player", label: "Lecteur", icon: "▶️" },
    { id: "explorer", label: "Explorer", icon: "🔍" },
    { id: "debug", label: "Debug", icon: "🐛" },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 safe-area-inset-bottom">
      <div className="max-w-md mx-auto flex">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`flex-1 py-2 flex flex-col items-center gap-1 transition-colors ${
              activeTab === tab.id ? "text-blue-500" : "text-gray-400"
            }`}
          >
            <span className="text-2xl">{tab.icon}</span>
            <span className="text-xs font-medium">{tab.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

// Main App
const AppContent = () => {
  const [activeTab, setActiveTab] = useState("library");
  const [currentView, setCurrentView] = useState("library");
  const [selectedFeedUrl, setSelectedFeedUrl] = useState(null);

  const handleNavigate = (view, feedUrl = null) => {
    setCurrentView(view);
    setSelectedFeedUrl(feedUrl);
  };

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    setCurrentView(tabId);
    setSelectedFeedUrl(null);
  };

  const renderContent = () => {
    if (currentView === "podcast" && selectedFeedUrl) {
      return (
        <PodcastDetail feedUrl={selectedFeedUrl} onNavigate={handleNavigate} />
      );
    }

    switch (activeTab) {
      case "library":
        return <Library onNavigate={handleNavigate} />;
      case "player":
        return <Player />;
      case "explorer":
        return <Explorer />;
      case "debug":
        return <Debug />;
      default:
        return <Library onNavigate={handleNavigate} />;
    }
  };

  return (
    <div className="h-screen bg-gray-50 flex flex-col max-w-md mx-auto">
      <div className="flex-1 overflow-hidden">{renderContent()}</div>
      <TabBar activeTab={activeTab} onTabChange={handleTabChange} />
    </div>
  );
};

const App = () => {
  useEffect(() => {
    console.log("🎧 iPod Podcast Player démarré");
    console.log("📱 Consultez l'onglet Debug pour voir les logs");
  }, []);

  return <AppContent />;
};

export default App;
