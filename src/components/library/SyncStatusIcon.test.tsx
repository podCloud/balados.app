import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SyncStatusIcon } from "./SyncStatusIcon";

const mockOnNavigate = vi.fn();

const mockUseSync = vi.fn();
vi.mock("../../hooks/useSync", () => ({
  useSync: () => mockUseSync(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { count?: number }) => {
      const translations: Record<string, string> = {
        "sync.statusConnected": "Sync connected",
        "sync.statusSyncing": "Syncing in progress",
        "sync.statusPending": `${opts?.count} actions pending sync`,
        "sync.statusError": "Sync error",
      };
      return translations[key] || key;
    },
  }),
}));

describe("SyncStatusIcon", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing when no serverUrl configured", () => {
    mockUseSync.mockReturnValue({
      status: "disconnected",
      serverUrl: null,
      pendingCount: 0,
    });

    const { container } = render(<SyncStatusIcon onNavigate={mockOnNavigate} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders green cloud when connected", () => {
    mockUseSync.mockReturnValue({
      status: "connected",
      serverUrl: "https://sync.example.com",
      pendingCount: 0,
    });

    render(<SyncStatusIcon onNavigate={mockOnNavigate} />);
    const button = screen.getByRole("button");
    expect(button).toHaveAttribute("aria-label", "Sync connected");
  });

  it("renders spinning loader when syncing", () => {
    mockUseSync.mockReturnValue({
      status: "syncing",
      serverUrl: "https://sync.example.com",
      pendingCount: 0,
    });

    render(<SyncStatusIcon onNavigate={mockOnNavigate} />);
    const button = screen.getByRole("button");
    expect(button).toHaveAttribute("aria-label", "Syncing in progress");
    expect(button.querySelector(".animate-spin")).toBeTruthy();
  });

  it("renders blue cloud with badge when pending", () => {
    mockUseSync.mockReturnValue({
      status: "pending",
      serverUrl: "https://sync.example.com",
      pendingCount: 3,
    });

    render(<SyncStatusIcon onNavigate={mockOnNavigate} />);
    const button = screen.getByRole("button");
    expect(button).toHaveAttribute("aria-label", "3 actions pending sync");
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("renders red alert when error", () => {
    mockUseSync.mockReturnValue({
      status: "error",
      serverUrl: "https://sync.example.com",
      pendingCount: 0,
    });

    render(<SyncStatusIcon onNavigate={mockOnNavigate} />);
    const button = screen.getByRole("button");
    expect(button).toHaveAttribute("aria-label", "Sync error");
  });

  it("navigates to settings on click", () => {
    mockUseSync.mockReturnValue({
      status: "connected",
      serverUrl: "https://sync.example.com",
      pendingCount: 0,
    });

    render(<SyncStatusIcon onNavigate={mockOnNavigate} />);
    fireEvent.click(screen.getByRole("button"));
    expect(mockOnNavigate).toHaveBeenCalledWith("settings");
  });
});
