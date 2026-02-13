import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SyncSettings } from "./SyncSettings";

// Mock SyncClient - vi.hoisted ensures these are available before vi.mock hoisting
const { mockTestConnection, mockSaveCredentials, mockClearCredentials } =
  vi.hoisted(() => ({
    mockTestConnection: vi.fn().mockResolvedValue(true),
    mockSaveCredentials: vi.fn().mockResolvedValue(undefined),
    mockClearCredentials: vi.fn().mockResolvedValue(undefined),
  }));

vi.mock("../../services/sync/client", () => {
  class SyncClient {
    constructor() {}
    testConnection = mockTestConnection;
    saveCredentials = mockSaveCredentials;
    clearCredentials = mockClearCredentials;
    static fromSettings = vi.fn().mockResolvedValue({
      clearCredentials: mockClearCredentials,
    });
  }
  return { SyncClient };
});

// Mock storage
const mockGetSettings = vi.fn().mockResolvedValue({
  locale: "fr",
  proxies: [],
});
const mockSaveSettings = vi.fn().mockResolvedValue(undefined);

vi.mock("../../services/storage", () => ({
  getSettings: (...args: unknown[]) => mockGetSettings(...args),
  saveSettings: (...args: unknown[]) => mockSaveSettings(...args),
}));

// Mock useSyncQueue
const mockProcessQueue = vi.fn();

vi.mock("../../hooks/useSyncQueue", () => ({
  useSyncQueue: () => ({
    pendingCount: 0,
    isSyncing: false,
    lastSyncError: null,
    processQueue: mockProcessQueue,
    clearError: vi.fn(),
  }),
}));

// Mock i18n
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      const translations: Record<string, string> = {
        "syncSettings.title": "Synchronisation",
        "syncSettings.connected": "Connected",
        "syncSettings.connecting": "Connecting...",
        "syncSettings.disconnected": "Disconnected",
        "syncSettings.error": "Error",
        "syncSettings.connect": "Connect",
        "syncSettings.disconnect": "Disconnect",
        "syncSettings.disconnectConfirm": "Are you sure?",
        "syncSettings.serverUrl": "Server URL",
        "syncSettings.serverUnreachable": "Server unreachable",
        "syncSettings.connectionError": "Connection error",
        "syncSettings.connectionFailed": "Connection failed",
        "syncSettings.invalidToken": "Invalid token",
        "syncSettings.invalidServerUrl": "Invalid server URL",
        "syncSettings.syncNow": "Sync now",
        "syncSettings.lastSync": "Last sync",
        "syncSettings.never": "Never",
        "syncSettings.justNow": "Just now",
        "syncSettings.minutesAgo": `${opts?.count} min ago`,
        "syncSettings.hoursAgo": `${opts?.count}h ago`,
        "syncSettings.daysAgo": `${opts?.count}d ago`,
        "syncSettings.manualToken": "Manual token",
        "syncSettings.hideToken": "Hide token",
        "syncSettings.tokenPlaceholder": "Paste token here",
        "syncSettings.connectWithToken": "Connect with token",
        "sync.syncing": "Syncing...",
        "sync.pending": `${opts?.count} pending`,
        "sync.syncError": "Sync error",
      };
      return translations[key] || key;
    },
  }),
}));

describe("SyncSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    mockGetSettings.mockResolvedValue({
      locale: "fr",
      proxies: [],
    });
    mockTestConnection.mockResolvedValue(true);
  });

  it("shows loading state initially", () => {
    render(<SyncSettings />);
    // The loading spinner should be present briefly
    expect(screen.getByText("Synchronisation")).toBeInTheDocument();
  });

  it("shows disconnected state when no server configured", async () => {
    render(<SyncSettings />);

    await waitFor(() => {
      expect(screen.getByText("Disconnected")).toBeInTheDocument();
    });
  });

  it("shows server URL input when disconnected", async () => {
    render(<SyncSettings />);

    await waitFor(() => {
      expect(
        screen.getByPlaceholderText("sync.balados.app")
      ).toBeInTheDocument();
    });
  });

  it("shows connect button when disconnected", async () => {
    render(<SyncSettings />);

    await waitFor(() => {
      expect(screen.getByText("Connect")).toBeInTheDocument();
    });
  });

  it("connect button is disabled when server URL is empty", async () => {
    render(<SyncSettings />);

    await waitFor(() => {
      const connectBtn = screen.getByText("Connect").closest("button");
      expect(connectBtn).toBeDisabled();
    });
  });

  it("connect button is enabled when server URL has value", async () => {
    const user = userEvent.setup();
    render(<SyncSettings />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText("sync.balados.app")).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText("sync.balados.app");
    await user.type(input, "sync.example.com");

    const connectBtn = screen.getByText("Connect").closest("button");
    expect(connectBtn).not.toBeDisabled();
  });

  it("shows connected state when server is configured and reachable", async () => {
    mockGetSettings.mockResolvedValue({
      locale: "fr",
      proxies: [],
      syncServerUrl: "https://sync.example.com",
      syncToken: "valid-token",
    });

    render(<SyncSettings />);

    await waitFor(() => {
      expect(screen.getByText("Connected")).toBeInTheDocument();
    });

    // Should show server hostname
    expect(screen.getByText("sync.example.com")).toBeInTheDocument();
  });

  it("shows error state when server is configured but unreachable", async () => {
    mockGetSettings.mockResolvedValue({
      locale: "fr",
      proxies: [],
      syncServerUrl: "https://sync.example.com",
      syncToken: "valid-token",
    });
    mockTestConnection.mockResolvedValue(false);

    render(<SyncSettings />);

    await waitFor(() => {
      expect(screen.getByText("Error")).toBeInTheDocument();
    });

    expect(screen.getByText("Connection failed")).toBeInTheDocument();
  });

  it("shows disconnect button when connected", async () => {
    mockGetSettings.mockResolvedValue({
      locale: "fr",
      proxies: [],
      syncServerUrl: "https://sync.example.com",
      syncToken: "valid-token",
    });

    render(<SyncSettings />);

    await waitFor(() => {
      expect(screen.getByText("Disconnect")).toBeInTheDocument();
    });
  });

  it("shows sync now button when connected", async () => {
    mockGetSettings.mockResolvedValue({
      locale: "fr",
      proxies: [],
      syncServerUrl: "https://sync.example.com",
      syncToken: "valid-token",
    });

    render(<SyncSettings />);

    await waitFor(() => {
      expect(screen.getByText("Sync now")).toBeInTheDocument();
    });
  });

  it("shows last sync time when connected", async () => {
    mockGetSettings.mockResolvedValue({
      locale: "fr",
      proxies: [],
      syncServerUrl: "https://sync.example.com",
      syncToken: "valid-token",
      lastSyncAt: Date.now() - 30000, // 30 seconds ago
    });

    render(<SyncSettings />);

    await waitFor(() => {
      expect(screen.getByText(/Last sync/)).toBeInTheDocument();
    });
  });

  it("shows 'Never' when no sync has occurred", async () => {
    mockGetSettings.mockResolvedValue({
      locale: "fr",
      proxies: [],
      syncServerUrl: "https://sync.example.com",
      syncToken: "valid-token",
    });

    render(<SyncSettings />);

    await waitFor(() => {
      expect(screen.getByText(/Never/)).toBeInTheDocument();
    });
  });

  it("clicking sync now triggers processQueue", async () => {
    mockGetSettings.mockResolvedValue({
      locale: "fr",
      proxies: [],
      syncServerUrl: "https://sync.example.com",
      syncToken: "valid-token",
    });

    render(<SyncSettings />);

    await waitFor(() => {
      expect(screen.getByText("Sync now")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Sync now").closest("button")!);

    expect(mockProcessQueue).toHaveBeenCalled();
  });

  it("disconnect clears credentials and resets state", async () => {
    mockGetSettings.mockResolvedValue({
      locale: "fr",
      proxies: [],
      syncServerUrl: "https://sync.example.com",
      syncToken: "valid-token",
    });

    // Mock window.confirm to return true
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<SyncSettings />);

    await waitFor(() => {
      expect(screen.getByText("Disconnect")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Disconnect").closest("button")!);

    await waitFor(() => {
      expect(mockClearCredentials).toHaveBeenCalled();
    });

    expect(mockSaveSettings).toHaveBeenCalledWith({ lastSyncAt: undefined });
  });

  it("disconnect does nothing when user cancels confirmation", async () => {
    mockGetSettings.mockResolvedValue({
      locale: "fr",
      proxies: [],
      syncServerUrl: "https://sync.example.com",
      syncToken: "valid-token",
    });

    vi.spyOn(window, "confirm").mockReturnValue(false);

    render(<SyncSettings />);

    await waitFor(() => {
      expect(screen.getByText("Disconnect")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Disconnect").closest("button")!);

    expect(mockClearCredentials).not.toHaveBeenCalled();
  });

  it("shows manual token input toggle", async () => {
    render(<SyncSettings />);

    await waitFor(() => {
      expect(screen.getByText("Manual token")).toBeInTheDocument();
    });
  });

  it("toggles manual token input visibility", async () => {
    const user = userEvent.setup();
    render(<SyncSettings />);

    await waitFor(() => {
      expect(screen.getByText("Manual token")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Manual token"));

    expect(
      screen.getByPlaceholderText("Paste token here")
    ).toBeInTheDocument();
    expect(screen.getByText("Connect with token")).toBeInTheDocument();
  });

  it("handles connect with server unreachable", async () => {
    const user = userEvent.setup();
    mockTestConnection.mockResolvedValue(false);

    render(<SyncSettings />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText("sync.balados.app")).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText("sync.balados.app");
    await user.type(input, "bad.server.com");

    fireEvent.click(screen.getByText("Connect").closest("button")!);

    await waitFor(() => {
      expect(screen.getByText("Server unreachable")).toBeInTheDocument();
    });
  });

  it("handles manual token connection with valid token", async () => {
    const user = userEvent.setup();

    render(<SyncSettings />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText("sync.balados.app")).toBeInTheDocument();
    });

    // Enter server URL
    await user.type(
      screen.getByPlaceholderText("sync.balados.app"),
      "sync.example.com"
    );

    // Show and fill token input
    await user.click(screen.getByText("Manual token"));
    await user.type(
      screen.getByPlaceholderText("Paste token here"),
      "my-secret-token"
    );

    // Click connect with token
    fireEvent.click(screen.getByText("Connect with token"));

    await waitFor(() => {
      expect(mockSaveCredentials).toHaveBeenCalled();
    });

    expect(screen.getByText("Connected")).toBeInTheDocument();
  });

  it("handles manual token connection with invalid token", async () => {
    const user = userEvent.setup();
    mockTestConnection.mockResolvedValue(false);

    render(<SyncSettings />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText("sync.balados.app")).toBeInTheDocument();
    });

    await user.type(
      screen.getByPlaceholderText("sync.balados.app"),
      "sync.example.com"
    );

    await user.click(screen.getByText("Manual token"));
    await user.type(
      screen.getByPlaceholderText("Paste token here"),
      "bad-token"
    );

    fireEvent.click(screen.getByText("Connect with token"));

    await waitFor(() => {
      expect(screen.getByText("Invalid token")).toBeInTheDocument();
    });
  });
});
