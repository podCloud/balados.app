import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  Wifi,
  WifiOff,
  RefreshCw,
  LogOut,
  Server,
  Clock,
  AlertCircle,
  Loader,
  ExternalLink,
} from "lucide-react";
import { SyncClient } from "../../services/sync/client";
import { getSettings, saveSettings } from "../../services/storage";
import { useSyncQueue } from "../../hooks/useSyncQueue";

type ConnectionStatus = "disconnected" | "connected" | "connecting" | "error";

interface SyncSettingsState {
  status: ConnectionStatus;
  serverUrl: string;
  lastSyncAt: number | null;
  error: string | null;
}

export const SyncSettings = () => {
  const { t } = useTranslation();
  const { pendingCount, isSyncing, lastSyncError, processQueue } =
    useSyncQueue();

  const [state, setState] = useState<SyncSettingsState>({
    status: "disconnected",
    serverUrl: "",
    lastSyncAt: null,
    error: null,
  });
  const [serverInput, setServerInput] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [showTokenInput, setShowTokenInput] = useState(false);
  const [tokenInput, setTokenInput] = useState("");

  // Load initial state from settings
  useEffect(() => {
    const loadSettings = async () => {
      const settings = await getSettings();
      if (settings.syncServerUrl && settings.syncToken) {
        // Test connection to see if still valid
        const client = new SyncClient(
          settings.syncServerUrl,
          settings.syncToken
        );
        const isConnected = await client.testConnection();

        setState({
          status: isConnected ? "connected" : "error",
          serverUrl: settings.syncServerUrl,
          lastSyncAt: settings.lastSyncAt ?? null,
          error: isConnected ? null : t("syncSettings.connectionFailed"),
        });
      }
      setIsLoading(false);
    };

    loadSettings();
  }, [t]);

  // Handle OAuth callback via postMessage
  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      // Require server URL to be configured first
      if (!state.serverUrl) {
        console.warn("OAuth callback received but no server configured");
        return;
      }

      // Validate origin matches our server
      try {
        const expectedOrigin = new URL(state.serverUrl).origin;
        if (event.origin !== expectedOrigin) {
          console.warn(`Rejected OAuth from unexpected origin: ${event.origin}`);
          return;
        }
      } catch (error) {
        // This indicates corrupted settings - show error to user
        console.error("Invalid server URL in settings", error);
        setState((prev) => ({
          ...prev,
          status: "error",
          error: t("syncSettings.invalidServerUrl"),
        }));
        return;
      }

      if (event.data?.type === "oauth_callback" && event.data?.token) {
        const client = new SyncClient(state.serverUrl, event.data.token);
        await client.saveCredentials();

        setState((prev) => ({
          ...prev,
          status: "connected",
          error: null,
        }));

        // Trigger initial sync
        processQueue();
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [state.serverUrl, processQueue]);

  // Connect to server
  const handleConnect = useCallback(async () => {
    if (!serverInput.trim()) return;

    // Normalize URL
    let url = serverInput.trim();
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      url = `https://${url}`;
    }
    url = url.replace(/\/$/, ""); // Remove trailing slash

    setState((prev) => ({ ...prev, status: "connecting", error: null }));

    try {
      // Test if server is reachable
      const client = new SyncClient(url);
      const isReachable = await client.testConnection();

      if (!isReachable) {
        setState((prev) => ({
          ...prev,
          status: "error",
          error: t("syncSettings.serverUnreachable"),
        }));
        return;
      }

      setState((prev) => ({ ...prev, serverUrl: url }));

      // Open authorization page in new window
      const redirectUri = encodeURIComponent(window.location.origin);
      const authUrl = `${url}/authorize?redirect_uri=${redirectUri}&response_type=token`;
      window.open(authUrl, "balados_auth", "width=600,height=700");
    } catch {
      setState((prev) => ({
        ...prev,
        status: "error",
        error: t("syncSettings.connectionError"),
      }));
    }
  }, [serverInput, t]);

  // Manual token input (for development/testing)
  const handleManualToken = useCallback(async () => {
    if (!serverInput.trim() || !tokenInput.trim()) return;

    let url = serverInput.trim();
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      url = `https://${url}`;
    }
    url = url.replace(/\/$/, "");

    setState((prev) => ({ ...prev, status: "connecting", error: null }));

    try {
      const client = new SyncClient(url, tokenInput.trim());
      const isValid = await client.testConnection();

      if (!isValid) {
        setState((prev) => ({
          ...prev,
          status: "error",
          error: t("syncSettings.invalidToken"),
        }));
        return;
      }

      await client.saveCredentials();

      setState({
        status: "connected",
        serverUrl: url,
        lastSyncAt: null,
        error: null,
      });

      setTokenInput("");
      setShowTokenInput(false);

      // Trigger initial sync
      processQueue();
    } catch {
      setState((prev) => ({
        ...prev,
        status: "error",
        error: t("syncSettings.connectionError"),
      }));
    }
  }, [serverInput, tokenInput, t, processQueue]);

  // Disconnect from server
  const handleDisconnect = useCallback(async () => {
    if (!window.confirm(t("syncSettings.disconnectConfirm"))) return;

    const client = await SyncClient.fromSettings();
    if (client) {
      await client.clearCredentials();
    }

    // Also clear lastSyncAt
    await saveSettings({ lastSyncAt: undefined });

    setState({
      status: "disconnected",
      serverUrl: "",
      lastSyncAt: null,
      error: null,
    });
    setServerInput("");
  }, [t]);

  // Manual sync trigger
  const handleSync = useCallback(async () => {
    processQueue();

    // Update lastSyncAt after sync
    const now = Date.now();
    await saveSettings({ lastSyncAt: now });
    setState((prev) => ({ ...prev, lastSyncAt: now }));
  }, [processQueue]);

  // Format relative time
  const formatLastSync = (timestamp: number | null): string => {
    if (!timestamp) return t("syncSettings.never");

    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return t("syncSettings.justNow");
    if (minutes < 60)
      return t("syncSettings.minutesAgo", { count: minutes });
    if (hours < 24) return t("syncSettings.hoursAgo", { count: hours });
    return t("syncSettings.daysAgo", { count: days });
  };

  if (isLoading) {
    return (
      <div className="mt-6">
        <h2 className="px-4 text-sm font-medium text-gray-500 uppercase tracking-wide mb-2">
          {t("syncSettings.title")}
        </h2>
        <div className="bg-white border-y border-gray-100 px-4 py-6 flex justify-center">
          <Loader size={20} className="animate-spin text-gray-400" />
        </div>
      </div>
    );
  }

  return (
    <div className="mt-6">
      <h2 className="px-4 text-sm font-medium text-gray-500 uppercase tracking-wide mb-2">
        {t("syncSettings.title")}
      </h2>

      <div className="bg-white border-y border-gray-100">
        {/* Connection status */}
        <div className="px-4 py-3 flex items-center justify-between border-b border-gray-100">
          <div className="flex items-center gap-3">
            {state.status === "connected" ? (
              <Wifi size={20} className="text-green-500" />
            ) : state.status === "connecting" ? (
              <Loader size={20} className="animate-spin text-blue-500" />
            ) : state.status === "error" ? (
              <AlertCircle size={20} className="text-red-500" />
            ) : (
              <WifiOff size={20} className="text-gray-400" />
            )}
            <div>
              <p className="text-sm font-medium text-gray-900">
                {state.status === "connected"
                  ? t("syncSettings.connected")
                  : state.status === "connecting"
                    ? t("syncSettings.connecting")
                    : state.status === "error"
                      ? t("syncSettings.error")
                      : t("syncSettings.disconnected")}
              </p>
              {state.status === "connected" && state.serverUrl && (
                <p className="text-xs text-gray-500 flex items-center gap-1">
                  <Server size={12} />
                  {new URL(state.serverUrl).hostname}
                </p>
              )}
            </div>
          </div>

          {state.status === "connected" && (
            <button
              onClick={handleDisconnect}
              className="text-sm text-red-500 hover:text-red-600 flex items-center gap-1"
            >
              <LogOut size={14} />
              {t("syncSettings.disconnect")}
            </button>
          )}
        </div>

        {/* Error message */}
        {state.error && (
          <div className="px-4 py-2 bg-red-50 border-b border-red-100">
            <p className="text-sm text-red-600">{state.error}</p>
          </div>
        )}

        {/* Sync error from queue */}
        {lastSyncError && (
          <div className="px-4 py-2 bg-yellow-50 border-b border-yellow-100">
            <p className="text-sm text-yellow-700">
              {t("sync.syncError")}: {lastSyncError}
            </p>
          </div>
        )}

        {/* Connected: show sync controls */}
        {state.status === "connected" && (
          <>
            {/* Last sync time */}
            <div className="px-4 py-3 flex items-center justify-between border-b border-gray-100">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Clock size={16} />
                <span>
                  {t("syncSettings.lastSync")}:{" "}
                  {formatLastSync(state.lastSyncAt)}
                </span>
              </div>

              {/* Pending actions count */}
              {pendingCount > 0 && (
                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full">
                  {t("sync.pending", { count: pendingCount })}
                </span>
              )}
            </div>

            {/* Sync button */}
            <div className="px-4 py-3">
              <button
                onClick={handleSync}
                disabled={isSyncing}
                className="w-full py-2 px-4 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isSyncing ? (
                  <>
                    <Loader size={16} className="animate-spin" />
                    {t("sync.syncing")}
                  </>
                ) : (
                  <>
                    <RefreshCw size={16} />
                    {t("syncSettings.syncNow")}
                  </>
                )}
              </button>
            </div>
          </>
        )}

        {/* Disconnected/connecting: show connection form */}
        {state.status !== "connected" && (
          <div className="px-4 py-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t("syncSettings.serverUrl")}
            </label>
            <input
              type="url"
              value={serverInput}
              onChange={(e) => setServerInput(e.target.value)}
              placeholder="sync.balados.app"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />

            <div className="mt-4 flex gap-2">
              <button
                onClick={handleConnect}
                disabled={!serverInput.trim() || state.status === "connecting"}
                className="flex-1 py-2 px-4 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {state.status === "connecting" ? (
                  <>
                    <Loader size={16} className="animate-spin" />
                    {t("syncSettings.connecting")}
                  </>
                ) : (
                  <>
                    <ExternalLink size={16} />
                    {t("syncSettings.connect")}
                  </>
                )}
              </button>
            </div>

            {/* Developer: manual token entry */}
            <div className="mt-4 pt-4 border-t border-gray-100">
              <button
                onClick={() => setShowTokenInput(!showTokenInput)}
                className="text-xs text-gray-500 hover:text-gray-700"
              >
                {showTokenInput
                  ? t("syncSettings.hideToken")
                  : t("syncSettings.manualToken")}
              </button>

              {showTokenInput && (
                <div className="mt-2">
                  <input
                    type="password"
                    value={tokenInput}
                    onChange={(e) => setTokenInput(e.target.value)}
                    placeholder={t("syncSettings.tokenPlaceholder")}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <button
                    onClick={handleManualToken}
                    disabled={
                      !serverInput.trim() ||
                      !tokenInput.trim() ||
                      state.status === "connecting"
                    }
                    className="mt-2 w-full py-2 px-4 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {t("syncSettings.connectWithToken")}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
