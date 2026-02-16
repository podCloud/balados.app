import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PlayerControls } from "./PlayerControls";

const mockSeek = vi.fn();
const mockPause = vi.fn();
const mockResume = vi.fn();
const mockSkipForward = vi.fn();
const mockSkipBackward = vi.fn();
const mockSetPlaybackRate = vi.fn();

let mockCurrentTime = 60;
let mockDuration = 300;

vi.mock("../../contexts", () => ({
  usePlayer: () => ({
    isPlaying: false,
    isLoading: false,
    get currentTime() { return mockCurrentTime; },
    get duration() { return mockDuration; },
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
    mockCurrentTime = 60;
    mockDuration = 300;
  });

  const getSlider = () => screen.getByRole("slider");

  describe("keyboard navigation on progress slider", () => {
    it("seeks forward 5s with ArrowRight", () => {
      render(<PlayerControls />);
      fireEvent.keyDown(getSlider(), { key: "ArrowRight" });
      expect(mockSeek).toHaveBeenCalledWith(65);
    });

    it("seeks backward 5s with ArrowLeft", () => {
      render(<PlayerControls />);
      fireEvent.keyDown(getSlider(), { key: "ArrowLeft" });
      expect(mockSeek).toHaveBeenCalledWith(55);
    });

    it("seeks forward 30s with ArrowUp", () => {
      render(<PlayerControls />);
      fireEvent.keyDown(getSlider(), { key: "ArrowUp" });
      expect(mockSeek).toHaveBeenCalledWith(90);
    });

    it("seeks backward 30s with ArrowDown", () => {
      render(<PlayerControls />);
      fireEvent.keyDown(getSlider(), { key: "ArrowDown" });
      expect(mockSeek).toHaveBeenCalledWith(30);
    });

    it("seeks to start with Home", () => {
      render(<PlayerControls />);
      fireEvent.keyDown(getSlider(), { key: "Home" });
      expect(mockSeek).toHaveBeenCalledWith(0);
    });

    it("seeks to end with End", () => {
      render(<PlayerControls />);
      fireEvent.keyDown(getSlider(), { key: "End" });
      expect(mockSeek).toHaveBeenCalledWith(300);
    });

    it("clamps ArrowLeft to 0 near start", () => {
      mockCurrentTime = 2;
      render(<PlayerControls />);
      fireEvent.keyDown(getSlider(), { key: "ArrowLeft" });
      expect(mockSeek).toHaveBeenCalledWith(0); // max(2-5, 0) = 0
    });

    it("clamps ArrowRight to duration near end", () => {
      mockCurrentTime = 298;
      render(<PlayerControls />);
      fireEvent.keyDown(getSlider(), { key: "ArrowRight" });
      expect(mockSeek).toHaveBeenCalledWith(300); // min(298+5, 300) = 300
    });

    it("clamps ArrowDown to 0 near start", () => {
      mockCurrentTime = 10;
      render(<PlayerControls />);
      fireEvent.keyDown(getSlider(), { key: "ArrowDown" });
      expect(mockSeek).toHaveBeenCalledWith(0); // max(10-30, 0) = 0
    });

    it("clamps ArrowUp to duration near end", () => {
      mockCurrentTime = 285;
      render(<PlayerControls />);
      fireEvent.keyDown(getSlider(), { key: "ArrowUp" });
      expect(mockSeek).toHaveBeenCalledWith(300); // min(285+30, 300) = 300
    });
  });
});
