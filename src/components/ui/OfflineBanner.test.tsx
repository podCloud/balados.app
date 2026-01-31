import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { OfflineBanner } from "./OfflineBanner";

// Mock hooks
const mockUseOnline = vi.fn();
const mockUseSyncQueue = vi.fn();

vi.mock("../../hooks/useOnline", () => ({
  useOnline: () => mockUseOnline(),
}));

vi.mock("../../hooks/useSyncQueue", () => ({
  useSyncQueue: () => mockUseSyncQueue(),
}));

// Mock i18n
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { count?: number }) => {
      const translations: Record<string, string> = {
        "common.offline": "Mode hors-ligne",
        "common.cancel": "Annuler",
        "sync.syncing": "Synchronisation...",
        "sync.pending": `${opts?.count} action(s) en attente`,
        "sync.syncError": "Erreur de sync",
      };
      return translations[key] || key;
    },
  }),
}));

describe("OfflineBanner", () => {
  beforeEach(() => {
    mockUseOnline.mockReturnValue(true);
    mockUseSyncQueue.mockReturnValue({
      pendingCount: 0,
      isSyncing: false,
      lastSyncError: null,
      clearError: vi.fn(),
    });
  });

  it("renders nothing when online and no pending actions", () => {
    const { container } = render(<OfflineBanner />);
    expect(container.firstChild).toBeNull();
  });

  it("shows offline banner when offline", () => {
    mockUseOnline.mockReturnValue(false);

    render(<OfflineBanner />);

    expect(screen.getByText("Mode hors-ligne")).toBeInTheDocument();
  });

  it("shows pending actions count", () => {
    mockUseSyncQueue.mockReturnValue({
      pendingCount: 3,
      isSyncing: false,
      lastSyncError: null,
      clearError: vi.fn(),
    });

    render(<OfflineBanner />);

    expect(screen.getByText("3 action(s) en attente")).toBeInTheDocument();
  });

  it("shows syncing state", () => {
    mockUseSyncQueue.mockReturnValue({
      pendingCount: 2,
      isSyncing: true,
      lastSyncError: null,
      clearError: vi.fn(),
    });

    render(<OfflineBanner />);

    expect(screen.getByText("Synchronisation...")).toBeInTheDocument();
  });

  it("shows error banner with dismiss button", () => {
    const clearError = vi.fn();
    mockUseSyncQueue.mockReturnValue({
      pendingCount: 0,
      isSyncing: false,
      lastSyncError: "Network error",
      clearError,
    });

    render(<OfflineBanner />);

    expect(screen.getByText(/Erreur de sync/)).toBeInTheDocument();
    expect(screen.getByText(/Network error/)).toBeInTheDocument();

    const dismissButton = screen.getByRole("button", { name: "Annuler" });
    fireEvent.click(dismissButton);

    expect(clearError).toHaveBeenCalledTimes(1);
  });

  it("shows both offline and pending when both conditions are true", () => {
    mockUseOnline.mockReturnValue(false);
    mockUseSyncQueue.mockReturnValue({
      pendingCount: 5,
      isSyncing: false,
      lastSyncError: null,
      clearError: vi.fn(),
    });

    render(<OfflineBanner />);

    expect(screen.getByText("Mode hors-ligne")).toBeInTheDocument();
    expect(screen.getByText("5 action(s) en attente")).toBeInTheDocument();
  });

  it("shows error banner above offline banner", () => {
    mockUseOnline.mockReturnValue(false);
    mockUseSyncQueue.mockReturnValue({
      pendingCount: 0,
      isSyncing: false,
      lastSyncError: "Sync failed",
      clearError: vi.fn(),
    });

    render(<OfflineBanner />);

    const errorBanner = screen.getByText(/Erreur de sync/).closest("div");
    const offlineBanner = screen.getByText("Mode hors-ligne").closest("div");

    // Error banner should appear first in DOM (red background)
    expect(errorBanner).toHaveClass("bg-red-500");
    expect(offlineBanner?.parentElement).toHaveClass("bg-amber-500");
  });
});
