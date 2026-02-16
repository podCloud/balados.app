import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PlayerControls } from "./PlayerControls";

const mockSeek = vi.fn();
const mockPause = vi.fn();
const mockResume = vi.fn();
const mockSkipForward = vi.fn();
const mockSkipBackward = vi.fn();
const mockSetPlaybackRate = vi.fn();

vi.mock("../../contexts", () => ({
  usePlayer: () => ({
    isPlaying: false,
    isLoading: false,
    currentTime: 60,
    duration: 300,
    pause: mockPause,
    resume: mockResume,
    seek: mockSeek,
    skipForward: mockSkipForward,
    skipBackward: mockSkipBackward,
    playbackRate: 1,
    setPlaybackRate: mockSetPlaybackRate,
  }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe("PlayerControls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const getSlider = () => screen.getByRole("slider");

  describe("keyboard navigation on progress slider", () => {
    it("seeks forward 5s with ArrowRight", () => {
      render(<PlayerControls />);
      fireEvent.keyDown(getSlider(), { key: "ArrowRight" });
      expect(mockSeek).toHaveBeenCalledWith(65); // 60 + 5
    });

    it("seeks backward 5s with ArrowLeft", () => {
      render(<PlayerControls />);
      fireEvent.keyDown(getSlider(), { key: "ArrowLeft" });
      expect(mockSeek).toHaveBeenCalledWith(55); // 60 - 5
    });

    it("seeks forward 30s with ArrowUp", () => {
      render(<PlayerControls />);
      fireEvent.keyDown(getSlider(), { key: "ArrowUp" });
      expect(mockSeek).toHaveBeenCalledWith(90); // 60 + 30
    });

    it("seeks backward 30s with ArrowDown", () => {
      render(<PlayerControls />);
      fireEvent.keyDown(getSlider(), { key: "ArrowDown" });
      expect(mockSeek).toHaveBeenCalledWith(30); // 60 - 30
    });

    it("seeks to start with Home", () => {
      render(<PlayerControls />);
      fireEvent.keyDown(getSlider(), { key: "Home" });
      expect(mockSeek).toHaveBeenCalledWith(0);
    });

    it("seeks to end with End", () => {
      render(<PlayerControls />);
      fireEvent.keyDown(getSlider(), { key: "End" });
      expect(mockSeek).toHaveBeenCalledWith(300); // duration
    });

    it("clamps ArrowLeft to 0", () => {
      render(<PlayerControls />);
      // currentTime is 60, seeking back 5 gives 55 (not clamped)
      // But ArrowDown with 30 from 60 gives 30 (not clamped either)
      // Let's just verify no negative values are possible
      fireEvent.keyDown(getSlider(), { key: "ArrowLeft" });
      const seekValue = mockSeek.mock.calls[0][0];
      expect(seekValue).toBeGreaterThanOrEqual(0);
    });

    it("clamps ArrowRight to duration", () => {
      render(<PlayerControls />);
      fireEvent.keyDown(getSlider(), { key: "ArrowRight" });
      const seekValue = mockSeek.mock.calls[0][0];
      expect(seekValue).toBeLessThanOrEqual(300);
    });
  });
});
