import { act, render, screen } from "@testing-library/react";
import { useTranslation } from "react-i18next";
import { afterAll, describe, expect, it } from "vitest";
import i18n from "./index";

// Every component test stubs react-i18next; this one runs the real i18next,
// react-i18next and locale files so a dependency upgrade that breaks plural
// selection, interpolation or re-rendering on language change fails here.
function EpisodeCount({ count }: { count: number }) {
  const { t } = useTranslation();
  return <p>{t("library.episodeCount", { count })}</p>;
}

describe("i18n (real i18next + react-i18next)", () => {
  afterAll(async () => {
    await i18n.changeLanguage("fr");
  });

  it("selects the plural form and interpolates the count", async () => {
    await act(() => i18n.changeLanguage("fr"));
    const { rerender } = render(<EpisodeCount count={1} />);
    expect(screen.getByText("1 épisode")).toBeInTheDocument();

    rerender(<EpisodeCount count={3} />);
    expect(screen.getByText("3 épisodes")).toBeInTheDocument();
  });

  it("re-renders mounted components when the language changes", async () => {
    await act(() => i18n.changeLanguage("fr"));
    render(<EpisodeCount count={2} />);
    expect(screen.getByText("2 épisodes")).toBeInTheDocument();

    await act(() => i18n.changeLanguage("en"));
    expect(screen.getByText("2 episodes")).toBeInTheDocument();
  });

  it("falls back to French for an unsupported language", async () => {
    await act(() => i18n.changeLanguage("de"));
    render(<EpisodeCount count={1} />);
    expect(screen.getByText("1 épisode")).toBeInTheDocument();
  });
});
