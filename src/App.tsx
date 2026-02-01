import { useState, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Library } from "./components/library/Library";
import { PodcastDetail } from "./components/podcast/PodcastDetail";
import { EpisodePlayer } from "./components/player/EpisodePlayer";
import { MiniPlayer } from "./components/player/MiniPlayer";
import { Explorer } from "./components/explorer/Explorer";
import { Debug } from "./components/debug/Debug";
import { Settings } from "./components/settings/Settings";
import { Stats } from "./components/stats/Stats";
import { TabBar } from "./components/ui/TabBar";
import { OfflineBanner } from "./components/ui/OfflineBanner";
import { ErrorBoundary } from "./components/ui/ErrorBoundary";
import { PlayerProvider, usePlayer, DownloadProvider } from "./contexts";
import { initDebugConsole } from "./services/debug";
import { migrateFromLocalStorage } from "./services/storage";
import type { TabId } from "./types";

// Initialize services
import "./services/i18n";

// Initialize debug console
initDebugConsole();

// Create QueryClient
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 1000 * 60 * 5, // 5 minutes
    },
  },
});

const AppContent = () => {
  const [activeTab, setActiveTab] = useState<TabId>("library");
  const [currentView, setCurrentView] = useState<string>("library");
  const [selectedFeedUrl, setSelectedFeedUrl] = useState<string | null>(null);

  useEffect(() => {
    // Migrate data from localStorage to IndexedDB
    migrateFromLocalStorage();
    console.log("balados.app démarré");
  }, []);

  const handleNavigate = (view: string, feedUrl: string | null = null) => {
    setCurrentView(view);
    setSelectedFeedUrl(feedUrl);
  };

  const handleTabChange = (tabId: TabId) => {
    setActiveTab(tabId);
    setCurrentView(tabId);
    setSelectedFeedUrl(null);
  };

  const renderContent = () => {
    if (currentView === "settings") {
      return <Settings onBack={() => handleNavigate("library")} onNavigate={handleNavigate} />;
    }

    if (currentView === "stats") {
      return <Stats onBack={() => handleNavigate("settings")} />;
    }

    if (currentView === "podcast" && selectedFeedUrl) {
      return (
        <PodcastDetail feedUrl={selectedFeedUrl} onNavigate={handleNavigate} />
      );
    }

    switch (activeTab) {
      case "library":
        return <Library onNavigate={handleNavigate} />;
      case "player":
        return <EpisodePlayer />;
      case "explorer":
        return <Explorer />;
      case "debug":
        return <Debug />;
      default:
        return <Library onNavigate={handleNavigate} />;
    }
  };

  const { currentEpisode } = usePlayer();
  const showMiniPlayer = currentEpisode && activeTab !== "player" && currentView !== "player";

  return (
    <div className="h-screen bg-gray-50 flex flex-col max-w-md mx-auto">
      <OfflineBanner />
      <div className={`flex-1 overflow-hidden ${showMiniPlayer ? "pb-14" : ""}`}>
        {renderContent()}
      </div>
      {showMiniPlayer && (
        <MiniPlayer onExpand={() => handleTabChange("player")} />
      )}
      <TabBar activeTab={activeTab} onTabChange={handleTabChange} />
    </div>
  );
};

const App = () => {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <DownloadProvider>
          <PlayerProvider>
            <AppContent />
          </PlayerProvider>
        </DownloadProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
};

export default App;
