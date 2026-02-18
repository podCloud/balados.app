import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useOnline } from "./useOnline";

describe("useOnline", () => {
  const originalNavigator = window.navigator;

  beforeEach(() => {
    // Reset navigator.onLine to true by default
    Object.defineProperty(window, "navigator", {
      value: { onLine: true },
      writable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(window, "navigator", {
      value: originalNavigator,
      writable: true,
    });
  });

  it("returns true when online", () => {
    Object.defineProperty(window, "navigator", {
      value: { onLine: true },
      writable: true,
    });

    const { result } = renderHook(() => useOnline());
    expect(result.current).toBe(true);
  });

  it("returns false when offline", () => {
    Object.defineProperty(window, "navigator", {
      value: { onLine: false },
      writable: true,
    });

    const { result } = renderHook(() => useOnline());
    expect(result.current).toBe(false);
  });

  it("updates when going offline", () => {
    const { result } = renderHook(() => useOnline());
    expect(result.current).toBe(true);

    act(() => {
      window.dispatchEvent(new Event("offline"));
    });

    expect(result.current).toBe(false);
  });

  it("updates when coming back online", () => {
    Object.defineProperty(window, "navigator", {
      value: { onLine: false },
      writable: true,
    });

    const { result } = renderHook(() => useOnline());
    expect(result.current).toBe(false);

    act(() => {
      window.dispatchEvent(new Event("online"));
    });

    expect(result.current).toBe(true);
  });

  it("cleans up event listeners on unmount", () => {
    const addEventListenerSpy = vi.spyOn(window, "addEventListener");
    const removeEventListenerSpy = vi.spyOn(window, "removeEventListener");

    const { unmount } = renderHook(() => useOnline());

    expect(addEventListenerSpy).toHaveBeenCalledWith("online", expect.any(Function));
    expect(addEventListenerSpy).toHaveBeenCalledWith("offline", expect.any(Function));

    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith("online", expect.any(Function));
    expect(removeEventListenerSpy).toHaveBeenCalledWith("offline", expect.any(Function));

    addEventListenerSpy.mockRestore();
    removeEventListenerSpy.mockRestore();
  });
});
