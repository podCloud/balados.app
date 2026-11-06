import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PodcastIcon } from "./PodcastIcon";

// lucide 1.x redrew its "podcast" icon as a studio microphone (MicSignal);
// the app keeps the classic broadcast logo of lucide 0.562.
describe("PodcastIcon", () => {
  it("draws the classic podcast logo with lucide's props", () => {
    const { container } = render(<PodcastIcon size={48} className="text-gray-300" />);
    const svg = container.querySelector("svg");

    expect(svg).toHaveAttribute("width", "48");
    expect(svg).toHaveAttribute("stroke-width", "2");
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).toHaveClass("lucide", "lucide-podcast", "text-gray-300");
    expect([...container.querySelectorAll("path")].map((p) => p.getAttribute("d"))).toEqual([
      "M13 17a1 1 0 1 0-2 0l.5 4.5a0.5 0.5 0 0 0 1 0z",
      "M16.85 18.58a9 9 0 1 0-9.7 0",
      "M8 14a5 5 0 1 1 8 0",
    ]);
    expect(container.querySelector('circle[cx="12"][cy="11"][r="1"]')).not.toBeNull();
  });
});
