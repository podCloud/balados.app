import { afterEach, describe, expect, it, vi } from "vitest";
import { putWithQuotaRecovery } from "./downloads";

const quotaError = () => new DOMException("full", "QuotaExceededError");

describe("putWithQuotaRecovery (#108 review)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("frees the artwork cache and retries once when storage is full", async () => {
    const put = vi.fn().mockRejectedValueOnce(quotaError()).mockResolvedValueOnce(undefined);
    const del = vi.fn().mockResolvedValue(true);
    vi.stubGlobal("caches", { delete: del });
    const makeResponse = vi.fn(() => new Response("audio"));

    await putWithQuotaRecovery({ put } as unknown as Cache, "https://ex.com/a.mp3", makeResponse);

    expect(del).toHaveBeenCalledWith("podcast-images");
    expect(put).toHaveBeenCalledTimes(2);
    expect(makeResponse).toHaveBeenCalledTimes(2); // a fresh body for the retry
  });

  it("rethrows other errors without touching the artwork cache", async () => {
    const put = vi.fn().mockRejectedValue(new TypeError("network"));
    const del = vi.fn();
    vi.stubGlobal("caches", { delete: del });

    await expect(
      putWithQuotaRecovery({ put } as unknown as Cache, "u", () => new Response("a")),
    ).rejects.toThrow("network");
    expect(del).not.toHaveBeenCalled();
  });
});
