import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Artwork } from "./Artwork";

describe("Artwork (#108)", () => {
  it("renders the image lazily with its alt text", () => {
    render(<Artwork src="https://ex.com/a.jpg" alt="Show" className="w-14 h-14" />);
    const img = screen.getByRole("img", { name: "Show" });
    expect(img).toHaveAttribute("src", "https://ex.com/a.jpg");
    expect(img).toHaveAttribute("loading", "lazy");
    expect(img).toHaveClass("w-14", "h-14");
  });

  it("falls back to fallbackSrc, then to the placeholder, when images fail", () => {
    const { container } = render(
      <Artwork
        src="https://ex.com/dead.jpg"
        fallbackSrc="https://ex.com/show.jpg"
        alt="Episode"
        className="w-14 h-14"
      />,
    );
    fireEvent.error(screen.getByRole("img"));
    expect(screen.getByRole("img")).toHaveAttribute("src", "https://ex.com/show.jpg");

    fireEvent.error(screen.getByRole("img"));
    expect(screen.queryByRole("img")).toBeNull();
    const placeholder = container.querySelector("[data-artwork-placeholder]");
    expect(placeholder).toHaveClass("w-14", "h-14");
  });

  it("walks a list of fallbacks in order", () => {
    render(
      <Artwork
        src="https://ex.com/ep.jpg"
        fallbackSrc={["https://ex.com/itunes.jpg", undefined, "https://ex.com/rss.png"]}
        alt="Ep"
      />,
    );
    fireEvent.error(screen.getByRole("img"));
    expect(screen.getByRole("img")).toHaveAttribute("src", "https://ex.com/itunes.jpg");
    fireEvent.error(screen.getByRole("img"));
    expect(screen.getByRole("img")).toHaveAttribute("src", "https://ex.com/rss.png");
  });

  it("shows the placeholder and its content when there is no image at all", () => {
    render(<Artwork src="" alt="Show" className="w-16 h-16" placeholder={<span>P</span>} />);
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText("P")).toBeInTheDocument();
  });

  it("tries a new src again after a previous one failed", () => {
    const { rerender } = render(<Artwork src="https://ex.com/dead.jpg" alt="Show" />);
    fireEvent.error(screen.getByRole("img"));
    expect(screen.queryByRole("img")).toBeNull();

    rerender(<Artwork src="https://ex.com/new.jpg" alt="Show" />);
    expect(screen.getByRole("img")).toHaveAttribute("src", "https://ex.com/new.jpg");
  });
});
