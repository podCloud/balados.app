import { render, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../../services/storage";
import { Library } from "./Library";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("./SubscriptionItem", () => ({
  SubscriptionItem: ({ url }: { url: string }) => <li data-testid="sub">{url}</li>,
}));
vi.mock("./SyncStatusIcon", () => ({ SyncStatusIcon: () => null }));
vi.mock("../../services/sync/backgroundSync", () => ({
  requestBackgroundSync: vi.fn().mockResolvedValue(undefined),
}));

// Regression for #83: seeding the default feed from inside a liveQuery
// querier threw "Readwrite transaction in liveQuery context" on a fresh
// profile and crashed the Library into the ErrorBoundary.
describe("Library default feed seeding", () => {
  beforeEach(async () => {
    await db.subscriptions.clear();
    await db.events.clear();
    await db.syncQueue.clear();
  });

  it("seeds exactly one default subscription on an empty DB under StrictMode", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { findAllByTestId } = render(
      <StrictMode>
        <Library onNavigate={vi.fn()} />
      </StrictMode>,
    );

    const items = await findAllByTestId("sub");
    expect(items).toHaveLength(1);
    expect(items[0].textContent).toBe("https://decouvrez.lepodcast.fr/rss");
    await waitFor(async () => expect(await db.subscriptions.count()).toBe(1));
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(await db.subscriptions.count()).toBe(1);
    expect(await db.events.where("type").equals("subscription_added").count()).toBe(1);
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("does not seed when a subscription already exists", async () => {
    await db.subscriptions.add({ url: "https://example.com/feed.xml", addedAt: 1 });
    const { findAllByTestId } = render(<Library onNavigate={vi.fn()} />);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(await findAllByTestId("sub")).toHaveLength(1);
    expect(await db.subscriptions.count()).toBe(1);
  });
});
