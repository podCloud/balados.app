import { describe, expect, it } from "vitest";
import { createArtworkStrategy, isArtworkRequest } from "./artworkCache";

const req = (url: string, destination: RequestDestination) =>
  ({ request: { url, destination } as Request, url: new URL(url) }) as Parameters<
    typeof isArtworkRequest
  >[0];

describe("artwork runtime caching (#108)", () => {
  it("matches image requests whatever their URL looks like", () => {
    expect(isArtworkRequest(req("https://cdn.ex.com/cover.jpg", "image"))).toBe(true);
    expect(isArtworkRequest(req("https://cdn.ex.com/cover.jpg?w=300", "image"))).toBe(true);
    expect(isArtworkRequest(req("https://img.ex.com/artwork/12345", "image"))).toBe(true);
  });

  it("does not match audio, feeds or documents", () => {
    expect(isArtworkRequest(req("https://cdn.ex.com/ep.mp3", "audio"))).toBe(false);
    expect(isArtworkRequest(req("https://ex.com/feed.jpg", ""))).toBe(false);
    expect(isArtworkRequest(req("https://ex.com/", "document"))).toBe(false);
  });

  it("caches opaque cross-origin responses (status 0) as well as 200", async () => {
    const plugin = createArtworkStrategy().plugins.find((p) => p.cacheWillUpdate);
    expect(plugin).toBeDefined();
    // Node cannot build an opaque response; Response.error() also has status 0.
    const opaque = Response.error();
    const notFound = new Response(null, { status: 404 });
    const willUpdate = plugin?.cacheWillUpdate as (p: {
      response: Response;
    }) => Promise<Response | null>;
    expect(await willUpdate({ response: opaque })).toBe(opaque);
    expect(await willUpdate({ response: notFound })).toBeNull();
  });
});
