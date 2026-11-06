import { act, renderHook } from "@testing-library/react";
import { useTranslation } from "react-i18next";
import { afterAll, describe, expect, it } from "vitest";
import i18n from "./index";

// Every component test stubs react-i18next; this one runs the real i18next,
// react-i18next and locale files so a dependency upgrade that breaks plural
// selection, interpolation or re-rendering on language change fails here.
const episodeCount = (count: number) => {
  const { result } = renderHook(() => useTranslation());
  return { result, text: () => result.current.t("library.episodeCount", { count }) };
};

describe("i18n (real i18next + react-i18next)", () => {
  afterAll(async () => {
    await i18n.changeLanguage("fr");
  });

  it("selects the plural form and interpolates the count", async () => {
    await act(() => i18n.changeLanguage("fr"));
    expect(episodeCount(1).text()).toBe("1 épisode");
    expect(episodeCount(3).text()).toBe("3 épisodes");
  });

  it("re-renders mounted hooks when the language changes", async () => {
    await act(() => i18n.changeLanguage("fr"));
    const { result, text } = episodeCount(2);
    expect(text()).toBe("2 épisodes");
    const before = result.current.t;

    await act(() => i18n.changeLanguage("en"));
    expect(result.current.t).not.toBe(before);
    expect(text()).toBe("2 episodes");
  });

  it("falls back to French for an unsupported language", async () => {
    await act(() => i18n.changeLanguage("de"));
    expect(episodeCount(1).text()).toBe("1 épisode");
  });
});
