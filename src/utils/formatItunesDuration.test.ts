import { describe, expect, it } from "vitest";
import { formatItunesDuration } from "./formatItunesDuration";

// itunes:duration is either a number of seconds or [[HH:]MM:]SS (#108).
describe("formatItunesDuration", () => {
  it("formats a number of seconds", () => {
    expect(formatItunesDuration("3723")).toBe("1:02:03");
    expect(formatItunesDuration("754")).toBe("12:34");
    expect(formatItunesDuration("59")).toBe("0:59");
  });

  it("normalises clock values", () => {
    expect(formatItunesDuration("01:02:03")).toBe("1:02:03");
    expect(formatItunesDuration("00:45:07")).toBe("45:07");
    expect(formatItunesDuration("5:07")).toBe("5:07");
  });

  it("drops fractional seconds", () => {
    expect(formatItunesDuration("3723.5")).toBe("1:02:03");
    expect(formatItunesDuration("01:02:03.500")).toBe("1:02:03");
  });

  it("returns an empty string for missing or unreadable values", () => {
    expect(formatItunesDuration("")).toBe("");
    expect(formatItunesDuration("0")).toBe("");
    expect(formatItunesDuration("about an hour")).toBe("");
  });
});
