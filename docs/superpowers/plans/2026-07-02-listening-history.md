# Listening History Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a client-side listening history page (issue #62) with podcast/period/status filters, aggregate stats (total time, episode count, completed count, streak, top 5 podcasts), and a paginated episode list — computed entirely from the local `playStatuses` Dexie table, matching balados.sync's reference implementation's filter/stats/streak semantics exactly.

**Architecture:** A pure logic module (`src/utils/listeningHistory.ts`) handles filtering/stats/streak computation with zero framework dependencies, fully unit-testable. A single page component (`src/components/history/ListeningHistory.tsx`) wires that logic to `useLiveQuery` (Dexie reactivity) and `useQuery` (feed metadata enrichment, reusing `InProgress.tsx`'s existing pattern), following the app's state-based navigation convention (no router).

**Tech Stack:** React 19, TypeScript (strict, no `any`), Dexie + dexie-react-hooks, TanStack Query, react-i18next, Tailwind, Vitest + Testing Library.

## Global Constraints

- TypeScript strict, no `any` (project-wide rule).
- Tailwind utility classes only, no custom CSS.
- Every user-facing string needs both `fr.json` and `en.json` entries (fr is the source language for this project; write fr first, then the en equivalent).
- Commit author: `--author="Claude <noreply@anthropic.com>"`.
- `npm run lint:fix` and `npm test` and `npm run build` must stay clean after every task.
- No schema changes to the Dexie DB.
- Branch: `feature/issue-62-listening-history` (already created, spec doc already committed there).

---

## Reference: exact algorithms (from balados.sync's queries.ex — do not deviate)

Period cutoffs are **rolling windows from now**, not calendar-aligned:
`week` = now − 7 days, `month` = now − 30 days, `year` = now − 365 days.

Status derivation: `completed` → `ps.completed === true`; `inProgress` →
`!ps.completed && ps.position > 0`; `notStarted` → `!ps.completed && ps.position === 0`.

Streak: distinct **local calendar days** with any activity (by `updatedAt`),
sorted descending; 0 if no activity or if the most recent activity is more
than 1 day before today; otherwise count consecutive days walking backward
from the most recent one until a gap.

---

### Task 1: Extract shared formatting utilities from Stats.tsx

**Files:**
- Create: `src/utils/formatting.ts`
- Create: `src/utils/formatting.test.ts`
- Modify: `src/components/stats/Stats.tsx:20-57` (remove local copies, import from new module)

**Interfaces:**
- Produces: `getFallbackTitle(feedUrl: string): string`, `formatRelativeTime(timestamp: number, t: TFunction, now?: number): string` — both exported from `src/utils/formatting.ts`. `formatRelativeTime` gains an optional `now` param (defaults to `Date.now()`) so later tasks can pass a fixed `now` for pure, deterministic composition — this is an additive, backward-compatible signature change.

- [ ] **Step 1: Write the failing test**

Create `src/utils/formatting.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";
import { formatRelativeTime, getFallbackTitle } from "./formatting";

describe("getFallbackTitle", () => {
  it("returns the hostname for a valid URL", () => {
    expect(getFallbackTitle("https://example.com/feed.xml")).toBe("example.com");
  });

  it("truncates and returns the raw string for an invalid URL", () => {
    const long = `not-a-url-${"x".repeat(60)}`;
    expect(getFallbackTitle(long)).toBe(`${long.slice(0, 50)}...`);
  });

  it("returns the raw string as-is when invalid and short", () => {
    expect(getFallbackTitle("not-a-url")).toBe("not-a-url");
  });
});

describe("formatRelativeTime", () => {
  const t = vi.fn((key: string, opts?: Record<string, unknown>) => {
    if (key === "syncSettings.justNow") return "just now";
    if (key === "syncSettings.minutesAgo") return `${opts?.count}m ago`;
    if (key === "syncSettings.hoursAgo") return `${opts?.count}h ago`;
    if (key === "syncSettings.daysAgo") return `${opts?.count}d ago`;
    return key;
  });

  it("returns 'just now' for under a minute", () => {
    const now = 1_000_000;
    expect(formatRelativeTime(now - 30_000, t, now)).toBe("just now");
  });

  it("returns minutes for under an hour", () => {
    const now = 1_000_000_000;
    expect(formatRelativeTime(now - 5 * 60 * 1000, t, now)).toBe("5m ago");
  });

  it("returns hours for under a day", () => {
    const now = 1_000_000_000;
    expect(formatRelativeTime(now - 3 * 60 * 60 * 1000, t, now)).toBe("3h ago");
  });

  it("returns days for a day or more", () => {
    const now = 1_000_000_000;
    expect(formatRelativeTime(now - 2 * 24 * 60 * 60 * 1000, t, now)).toBe("2d ago");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- formatting --run`
Expected: FAIL — `Cannot find module './formatting'` (file doesn't exist yet).

- [ ] **Step 3: Create the module (move code out of Stats.tsx, add `now` param)**

Create `src/utils/formatting.ts`:

```typescript
// Safe URL hostname extraction
export const getFallbackTitle = (feedUrl: string): string => {
  try {
    return new URL(feedUrl).hostname;
  } catch {
    return feedUrl.length > 50 ? `${feedUrl.slice(0, 50)}...` : feedUrl;
  }
};

export const formatRelativeTime = (
  timestamp: number,
  t: (key: string, options?: Record<string, unknown>) => string,
  now: number = Date.now(),
): string => {
  const diff = now - timestamp;
  const minutes = Math.floor(diff / (60 * 1000));
  const hours = Math.floor(diff / (60 * 60 * 1000));
  const days = Math.floor(diff / (24 * 60 * 60 * 1000));

  if (minutes < 1) return t("syncSettings.justNow");
  if (minutes < 60) return t("syncSettings.minutesAgo", { count: minutes });
  if (hours < 24) return t("syncSettings.hoursAgo", { count: hours });
  return t("syncSettings.daysAgo", { count: days });
};
```

Now edit `src/components/stats/Stats.tsx`: delete the local `getFallbackTitle` (lines 20-27) and `formatRelativeTime` (lines 43-57) definitions, and add this import near the top (with the other relative imports):

```typescript
import { formatRelativeTime, getFallbackTitle } from "../../utils/formatting";
```

- [ ] **Step 4: Run tests to verify everything passes**

Run: `npm test -- formatting stats --run`
Expected: PASS — new `formatting.test.ts` passes, and existing `Stats.test.tsx` still passes unchanged (pure refactor, no behavior change).

- [ ] **Step 5: Commit**

```bash
git add src/utils/formatting.ts src/utils/formatting.test.ts src/components/stats/Stats.tsx
git commit --author="Claude <noreply@anthropic.com>" -m "refactor: extract getFallbackTitle/formatRelativeTime into shared utils"
```

---

### Task 2: Add `getAllPlayStatuses` storage helper

**Files:**
- Modify: `src/services/storage/playStatus.ts` (add new export near `getPlayStatusForFeed`)
- Test: `src/services/storage/playStatus.test.ts` (add to the existing `describe("playStatus")` block, near the `getPlayStatusForFeed` tests)

**Interfaces:**
- Produces: `getAllPlayStatuses(): Promise<PlayStatus[]>`

- [ ] **Step 1: Write the failing test**

In `src/services/storage/playStatus.test.ts`, add a new `describe` block (alongside the existing ones, e.g. after `getPlayStatusForFeed`'s):

```typescript
  describe("getAllPlayStatuses", () => {
    it("returns all play statuses regardless of feed", async () => {
      await db.playStatuses.bulkPut([
        {
          episodeId: "ep1",
          feedUrl: "https://a.com/feed.xml",
          position: 100,
          duration: 1000,
          completed: false,
          updatedAt: Date.now(),
        },
        {
          episodeId: "ep2",
          feedUrl: "https://b.com/feed.xml",
          position: 200,
          duration: 2000,
          completed: true,
          updatedAt: Date.now(),
        },
      ]);

      const all = await getAllPlayStatuses();
      expect(all).toHaveLength(2);
    });

    it("returns an empty array when there are no play statuses", async () => {
      const all = await getAllPlayStatuses();
      expect(all).toEqual([]);
    });
  });
```

Add `getAllPlayStatuses` to the existing import list at the top of the test file (alongside `getPlayStatus`, `getPlayStatusForFeed`, etc.).

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- playStatus --run`
Expected: FAIL — `getAllPlayStatuses is not a function` (not exported yet).

- [ ] **Step 3: Implement**

In `src/services/storage/playStatus.ts`, add this export right after `getPlayStatusForFeed`:

```typescript
export const getAllPlayStatuses = async (): Promise<PlayStatus[]> => {
  return db.playStatuses.toArray();
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- playStatus --run`
Expected: PASS, all `playStatus.test.ts` tests green.

- [ ] **Step 5: Commit**

```bash
git add src/services/storage/playStatus.ts src/services/storage/playStatus.test.ts
git commit --author="Claude <noreply@anthropic.com>" -m "feat: add getAllPlayStatuses storage helper (#62)"
```

---

### Task 3: `listeningHistory.ts` — status derivation

**Files:**
- Create: `src/utils/listeningHistory.ts`
- Create: `src/utils/listeningHistory.test.ts`

**Interfaces:**
- Consumes: `PlayStatus` from `../types` (`episodeId, feedUrl, position, duration, completed, updatedAt`)
- Produces: `type HistoryStatus = "completed" | "inProgress" | "notStarted"`, `getEpisodeStatus(ps: PlayStatus): HistoryStatus`

- [ ] **Step 1: Write the failing test**

Create `src/utils/listeningHistory.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { getEpisodeStatus } from "./listeningHistory";
import type { PlayStatus } from "../types";

const basePlayStatus: PlayStatus = {
  episodeId: "ep1",
  feedUrl: "https://example.com/feed.xml",
  position: 0,
  duration: 1000,
  completed: false,
  updatedAt: Date.now(),
};

describe("getEpisodeStatus", () => {
  it("returns completed when completed is true", () => {
    expect(getEpisodeStatus({ ...basePlayStatus, completed: true, position: 500 })).toBe(
      "completed",
    );
  });

  it("returns inProgress when not completed and position > 0", () => {
    expect(getEpisodeStatus({ ...basePlayStatus, completed: false, position: 100 })).toBe(
      "inProgress",
    );
  });

  it("returns notStarted when not completed and position is 0", () => {
    expect(getEpisodeStatus({ ...basePlayStatus, completed: false, position: 0 })).toBe(
      "notStarted",
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- listeningHistory --run`
Expected: FAIL — `Cannot find module './listeningHistory'`.

- [ ] **Step 3: Implement**

Create `src/utils/listeningHistory.ts`:

```typescript
import type { PlayStatus } from "../types";

export type HistoryStatus = "completed" | "inProgress" | "notStarted";

export const getEpisodeStatus = (ps: PlayStatus): HistoryStatus => {
  if (ps.completed) return "completed";
  if (ps.position > 0) return "inProgress";
  return "notStarted";
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- listeningHistory --run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/listeningHistory.ts src/utils/listeningHistory.test.ts
git commit --author="Claude <noreply@anthropic.com>" -m "feat: add episode status derivation for listening history (#62)"
```

---

### Task 4: `listeningHistory.ts` — period filter

**Files:**
- Modify: `src/utils/listeningHistory.ts`
- Modify: `src/utils/listeningHistory.test.ts`

**Interfaces:**
- Produces: `type Period = "week" | "month" | "year" | ""`, `isWithinPeriod(updatedAt: number, period: Period, now: number): boolean`

- [ ] **Step 1: Write the failing test**

Add to `src/utils/listeningHistory.test.ts`:

```typescript
import { isWithinPeriod } from "./listeningHistory";

describe("isWithinPeriod", () => {
  const DAY = 24 * 60 * 60 * 1000;
  const now = 1_000_000_000_000;

  it("passes everything through when period is empty", () => {
    expect(isWithinPeriod(now - 1000 * DAY, "", now)).toBe(true);
  });

  it("includes a timestamp exactly at the week boundary", () => {
    expect(isWithinPeriod(now - 7 * DAY, "week", now)).toBe(true);
  });

  it("excludes a timestamp just past the week boundary", () => {
    expect(isWithinPeriod(now - 7 * DAY - 1, "week", now)).toBe(false);
  });

  it("includes a timestamp within the month window", () => {
    expect(isWithinPeriod(now - 15 * DAY, "month", now)).toBe(true);
  });

  it("excludes a timestamp past the month window", () => {
    expect(isWithinPeriod(now - 31 * DAY, "month", now)).toBe(false);
  });

  it("includes a timestamp within the year window", () => {
    expect(isWithinPeriod(now - 200 * DAY, "year", now)).toBe(true);
  });

  it("excludes a timestamp past the year window", () => {
    expect(isWithinPeriod(now - 366 * DAY, "year", now)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- listeningHistory --run`
Expected: FAIL — `isWithinPeriod is not a function`.

- [ ] **Step 3: Implement**

Add to `src/utils/listeningHistory.ts`:

```typescript
export type Period = "week" | "month" | "year" | "";

const PERIOD_DAYS: Record<Exclude<Period, "">, number> = { week: 7, month: 30, year: 365 };
const DAY_MS = 24 * 60 * 60 * 1000;

export const isWithinPeriod = (updatedAt: number, period: Period, now: number): boolean => {
  if (!period) return true;
  const cutoff = now - PERIOD_DAYS[period] * DAY_MS;
  return updatedAt >= cutoff;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- listeningHistory --run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/listeningHistory.ts src/utils/listeningHistory.test.ts
git commit --author="Claude <noreply@anthropic.com>" -m "feat: add rolling-window period filter for listening history (#62)"
```

---

### Task 5: `listeningHistory.ts` — combined filter

**Files:**
- Modify: `src/utils/listeningHistory.ts`
- Modify: `src/utils/listeningHistory.test.ts`

**Interfaces:**
- Consumes: `getEpisodeStatus`, `isWithinPeriod`, `HistoryStatus`, `Period` (this file, tasks 3-4)
- Produces: `interface HistoryFilters { feedUrl: string; period: Period; status: HistoryStatus | "" }`, `filterPlayStatuses(all: PlayStatus[], filters: HistoryFilters, now: number): PlayStatus[]` (sorted descending by `updatedAt`)

- [ ] **Step 1: Write the failing test**

Add to `src/utils/listeningHistory.test.ts`:

```typescript
import { filterPlayStatuses } from "./listeningHistory";

describe("filterPlayStatuses", () => {
  const now = 1_000_000_000_000;
  const DAY = 24 * 60 * 60 * 1000;

  const items: PlayStatus[] = [
    { episodeId: "a", feedUrl: "https://x.com/f", position: 500, duration: 1000, completed: true, updatedAt: now - DAY },
    { episodeId: "b", feedUrl: "https://y.com/f", position: 100, duration: 1000, completed: false, updatedAt: now - 2 * DAY },
    { episodeId: "c", feedUrl: "https://x.com/f", position: 0, duration: 1000, completed: false, updatedAt: now - 40 * DAY },
  ];

  it("returns everything sorted by most recent when no filters applied", () => {
    const result = filterPlayStatuses(items, { feedUrl: "", period: "", status: "" }, now);
    expect(result.map((i) => i.episodeId)).toEqual(["a", "b", "c"]);
  });

  it("filters by feedUrl", () => {
    const result = filterPlayStatuses(items, { feedUrl: "https://x.com/f", period: "", status: "" }, now);
    expect(result.map((i) => i.episodeId)).toEqual(["a", "c"]);
  });

  it("filters by period", () => {
    const result = filterPlayStatuses(items, { feedUrl: "", period: "week", status: "" }, now);
    expect(result.map((i) => i.episodeId)).toEqual(["a", "b"]);
  });

  it("filters by status", () => {
    const result = filterPlayStatuses(items, { feedUrl: "", period: "", status: "notStarted" }, now);
    expect(result.map((i) => i.episodeId)).toEqual(["c"]);
  });

  it("combines all three filters", () => {
    const result = filterPlayStatuses(
      items,
      { feedUrl: "https://x.com/f", period: "week", status: "completed" },
      now,
    );
    expect(result.map((i) => i.episodeId)).toEqual(["a"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- listeningHistory --run`
Expected: FAIL — `filterPlayStatuses is not a function`.

- [ ] **Step 3: Implement**

Add to `src/utils/listeningHistory.ts`:

```typescript
export interface HistoryFilters {
  feedUrl: string; // "" = all
  period: Period; // "" = all
  status: HistoryStatus | ""; // "" = all
}

export const filterPlayStatuses = (
  all: PlayStatus[],
  filters: HistoryFilters,
  now: number,
): PlayStatus[] =>
  all
    .filter((ps) => !filters.feedUrl || ps.feedUrl === filters.feedUrl)
    .filter((ps) => isWithinPeriod(ps.updatedAt, filters.period, now))
    .filter((ps) => !filters.status || getEpisodeStatus(ps) === filters.status)
    .sort((a, b) => b.updatedAt - a.updatedAt);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- listeningHistory --run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/listeningHistory.ts src/utils/listeningHistory.test.ts
git commit --author="Claude <noreply@anthropic.com>" -m "feat: combine feed/period/status filters for listening history (#62)"
```

---

### Task 6: `listeningHistory.ts` — stats aggregation

**Files:**
- Modify: `src/utils/listeningHistory.ts`
- Modify: `src/utils/listeningHistory.test.ts`

**Interfaces:**
- Consumes: `getFallbackTitle` from `./formatting` (Task 1), `Subscription` from `../types`
- Produces: `interface ListeningStats { totalTimeSeconds: number; totalEpisodes: number; completedCount: number; topPodcasts: Array<{ feedUrl: string; title: string; count: number }> }`, `computeListeningStats(all: PlayStatus[], subscriptions: Subscription[]): ListeningStats`

Note: streak is deliberately NOT part of `ListeningStats` here — it's added by `computeStreak` (Task 7) and combined by the caller (the component, Task 9), since it needs its own `now` and is independently unit-tested with its own edge cases.

- [ ] **Step 1: Write the failing test**

Add to `src/utils/listeningHistory.test.ts`:

```typescript
import { computeListeningStats } from "./listeningHistory";
import type { Subscription } from "../types";

describe("computeListeningStats", () => {
  const subs: Subscription[] = [
    { url: "https://x.com/f", addedAt: 0, title: "Podcast X" },
    // https://y.com/f intentionally has no subscription row, to exercise the fallback title
  ];

  it("returns zeroed stats for an empty history", () => {
    expect(computeListeningStats([], subs)).toEqual({
      totalTimeSeconds: 0,
      totalEpisodes: 0,
      completedCount: 0,
      topPodcasts: [],
    });
  });

  it("sums position, counts episodes and completions", () => {
    const items: PlayStatus[] = [
      { episodeId: "a", feedUrl: "https://x.com/f", position: 300, duration: 1000, completed: true, updatedAt: 1 },
      { episodeId: "b", feedUrl: "https://x.com/f", position: 200, duration: 1000, completed: false, updatedAt: 2 },
    ];
    const stats = computeListeningStats(items, subs);
    expect(stats.totalTimeSeconds).toBe(500);
    expect(stats.totalEpisodes).toBe(2);
    expect(stats.completedCount).toBe(1);
  });

  it("resolves subscription titles and falls back to hostname when unsubscribed", () => {
    const items: PlayStatus[] = [
      { episodeId: "a", feedUrl: "https://x.com/f", position: 1, duration: 1, completed: false, updatedAt: 1 },
      { episodeId: "b", feedUrl: "https://y.com/f", position: 1, duration: 1, completed: false, updatedAt: 1 },
    ];
    const stats = computeListeningStats(items, subs);
    const titles = stats.topPodcasts.map((p) => p.title).sort();
    expect(titles).toEqual(["Podcast X", "y.com"]);
  });

  it("ranks top podcasts by episode count, descending, capped at 5", () => {
    const items: PlayStatus[] = Array.from({ length: 7 }, (_, i) => ({
      episodeId: `ep${i}`,
      feedUrl: `https://feed${i % 7}.com/f`,
      position: 1,
      duration: 1,
      completed: false,
      updatedAt: i,
    }));
    // feed0 gets 2 episodes by adding one more
    items.push({
      episodeId: "extra",
      feedUrl: "https://feed0.com/f",
      position: 1,
      duration: 1,
      completed: false,
      updatedAt: 99,
    });
    const stats = computeListeningStats(items, []);
    expect(stats.topPodcasts).toHaveLength(5);
    expect(stats.topPodcasts[0]).toEqual({ feedUrl: "https://feed0.com/f", title: "feed0.com", count: 2 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- listeningHistory --run`
Expected: FAIL — `computeListeningStats is not a function`.

- [ ] **Step 3: Implement**

Add to `src/utils/listeningHistory.ts` (add the import at the top of the file):

```typescript
import { getFallbackTitle } from "./formatting";
import type { PlayStatus, Subscription } from "../types";

export interface ListeningStats {
  totalTimeSeconds: number;
  totalEpisodes: number;
  completedCount: number;
  topPodcasts: Array<{ feedUrl: string; title: string; count: number }>;
}

export const computeListeningStats = (
  all: PlayStatus[],
  subscriptions: Subscription[],
): ListeningStats => {
  const totalTimeSeconds = all.reduce((sum, ps) => sum + ps.position, 0);
  const completedCount = all.filter((ps) => ps.completed).length;

  const subsByUrl = new Map(subscriptions.map((s) => [s.url, s]));
  const countsByFeed = new Map<string, number>();
  for (const ps of all) {
    countsByFeed.set(ps.feedUrl, (countsByFeed.get(ps.feedUrl) ?? 0) + 1);
  }

  const topPodcasts = [...countsByFeed.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([feedUrl, count]) => ({
      feedUrl,
      title: subsByUrl.get(feedUrl)?.title || getFallbackTitle(feedUrl),
      count,
    }));

  return {
    totalTimeSeconds,
    totalEpisodes: all.length,
    completedCount,
    topPodcasts,
  };
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- listeningHistory --run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/listeningHistory.ts src/utils/listeningHistory.test.ts
git commit --author="Claude <noreply@anthropic.com>" -m "feat: add listening stats aggregation (#62)"
```

---

### Task 7: `listeningHistory.ts` — streak calculation

**Files:**
- Modify: `src/utils/listeningHistory.ts`
- Modify: `src/utils/listeningHistory.test.ts`

**Interfaces:**
- Produces: `computeStreak(all: PlayStatus[], now: number): number`

- [ ] **Step 1: Write the failing test**

Add to `src/utils/listeningHistory.test.ts`:

```typescript
import { computeStreak } from "./listeningHistory";

describe("computeStreak", () => {
  const DAY = 24 * 60 * 60 * 1000;
  // Fixed "now": 2026-07-02T12:00:00 local, well clear of any DST edge for this test.
  const now = new Date(2026, 6, 2, 12, 0, 0).getTime();

  const at = (daysAgo: number, hour = 10) => {
    const d = new Date(now);
    d.setDate(d.getDate() - daysAgo);
    d.setHours(hour, 0, 0, 0);
    return d.getTime();
  };

  const ps = (updatedAt: number): PlayStatus => ({
    episodeId: `ep-${updatedAt}`,
    feedUrl: "https://x.com/f",
    position: 1,
    duration: 1,
    completed: false,
    updatedAt,
  });

  it("returns 0 for no activity", () => {
    expect(computeStreak([], now)).toBe(0);
  });

  it("returns 0 when the most recent activity is 2+ days ago", () => {
    expect(computeStreak([ps(at(2))], now)).toBe(0);
  });

  it("returns 1 for a single day of activity today", () => {
    expect(computeStreak([ps(at(0))], now)).toBe(1);
  });

  it("counts a streak that continues through yesterday", () => {
    expect(computeStreak([ps(at(1))], now)).toBe(1);
  });

  it("counts multiple consecutive days ending today", () => {
    expect(computeStreak([ps(at(0)), ps(at(1)), ps(at(2))], now)).toBe(3);
  });

  it("stops counting at a gap of 2+ days", () => {
    expect(computeStreak([ps(at(0)), ps(at(1)), ps(at(3))], now)).toBe(2);
  });

  it("collapses multiple entries on the same day into one streak day", () => {
    expect(computeStreak([ps(at(0, 9)), ps(at(0, 20)), ps(at(1, 8))], now)).toBe(2);
  });

  it("counts a streak ending yesterday even with older non-consecutive activity further back", () => {
    expect(computeStreak([ps(at(1)), ps(at(2)), ps(at(10))], now)).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- listeningHistory --run`
Expected: FAIL — `computeStreak is not a function`.

- [ ] **Step 3: Implement**

Add to `src/utils/listeningHistory.ts`:

```typescript
// Local calendar day, as a comparable integer key (year*10000 + month*100 + day).
const dayKey = (timestamp: number): number => {
  const d = new Date(timestamp);
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
};

// Whole-day difference between two dayKey values, computed via real Date
// objects at local midnight so DST transitions don't skew the count.
const daysBetween = (a: number, b: number): number => {
  const toDate = (key: number) =>
    new Date(Math.floor(key / 10000), Math.floor((key % 10000) / 100) - 1, key % 100);
  return Math.round((toDate(a).getTime() - toDate(b).getTime()) / DAY_MS);
};

export const computeStreak = (all: PlayStatus[], now: number): number => {
  const dates = [...new Set(all.map((ps) => dayKey(ps.updatedAt)))].sort((a, b) => b - a);
  if (dates.length === 0) return 0;

  const today = dayKey(now);
  if (daysBetween(today, dates[0]) > 1) return 0; // no activity today or yesterday

  let streak = 1;
  for (let i = 0; i < dates.length - 1; i++) {
    if (daysBetween(dates[i], dates[i + 1]) === 1) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- listeningHistory --run`
Expected: PASS — all `listeningHistory.test.ts` tests (from tasks 3-7) green.

- [ ] **Step 5: Commit**

```bash
git add src/utils/listeningHistory.ts src/utils/listeningHistory.test.ts
git commit --author="Claude <noreply@anthropic.com>" -m "feat: add listening streak calculation (#62)"
```

---

### Task 8: `ListeningHistory.tsx` — skeleton, header, empty state

**Files:**
- Create: `src/components/history/ListeningHistory.tsx`
- Create: `src/components/history/ListeningHistory.test.tsx`
- Modify: `src/services/i18n/locales/fr.json` (add `listeningHistory` namespace, initial keys)
- Modify: `src/services/i18n/locales/en.json` (same)

**Interfaces:**
- Consumes: `getAllPlayStatuses` (Task 2)
- Produces: `ListeningHistory` component with props `{ onBack: () => void }`

- [ ] **Step 1: Write the failing test**

Create `src/components/history/ListeningHistory.test.tsx`:

```typescript
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUseLiveQuery = vi.fn();
vi.mock("dexie-react-hooks", () => ({
  useLiveQuery: (fn: () => unknown) => mockUseLiveQuery(fn),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: new Map(), isLoading: false }),
}));

vi.mock("../../contexts", () => ({
  usePlayer: () => ({ play: vi.fn(), currentEpisode: null, isPlaying: false }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      const translations: Record<string, string> = {
        "listeningHistory.title": "Listening History",
        "listeningHistory.empty": "No listening history yet",
        "settings.back": "Back",
      };
      return translations[key] ?? `${key}${opts?.count !== undefined ? `:${opts.count}` : ""}`;
    },
  }),
}));

import { ListeningHistory } from "./ListeningHistory";

describe("ListeningHistory", () => {
  beforeEach(() => {
    mockUseLiveQuery.mockReset();
  });

  it("renders the page title", () => {
    mockUseLiveQuery.mockReturnValue([]);
    render(<ListeningHistory onBack={vi.fn()} />);
    expect(screen.getByText("Listening History")).toBeInTheDocument();
  });

  it("shows the empty state when there is no history", async () => {
    mockUseLiveQuery.mockReturnValue([]);
    render(<ListeningHistory onBack={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText("No listening history yet")).toBeInTheDocument();
    });
  });

  it("calls onBack when the back button is clicked", () => {
    mockUseLiveQuery.mockReturnValue([]);
    const onBack = vi.fn();
    render(<ListeningHistory onBack={onBack} />);
    screen.getByLabelText("Back").click();
    expect(onBack).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- ListeningHistory --run`
Expected: FAIL — `Cannot find module './ListeningHistory'`.

- [ ] **Step 3: Add i18n keys and implement the skeleton**

In `src/services/i18n/locales/fr.json`, add this new top-level key right after the `"inProgress"` block (before `"stats"`):

```json
  "listeningHistory": {
    "title": "Historique d'écoute",
    "empty": "Aucun historique d'écoute"
  },
```

In `src/services/i18n/locales/en.json`, same position:

```json
  "listeningHistory": {
    "title": "Listening History",
    "empty": "No listening history yet"
  },
```

Create `src/components/history/ListeningHistory.tsx`:

```typescript
import { useLiveQuery } from "dexie-react-hooks";
import { ChevronLeft, History as HistoryIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { getAllPlayStatuses } from "../../services/storage/playStatus";

interface ListeningHistoryProps {
  onBack: () => void;
}

export const ListeningHistory = ({ onBack }: ListeningHistoryProps) => {
  const { t } = useTranslation();

  const allPlayStatuses = useLiveQuery(() => getAllPlayStatuses(), []);
  const isLoading = allPlayStatuses === undefined;

  return (
    <div className="h-full flex flex-col bg-white">
      <div className="flex items-center gap-2 p-4 border-b border-gray-200">
        <button
          type="button"
          onClick={onBack}
          className="p-1 -ml-1 hover:bg-gray-100 rounded-lg"
          aria-label={t("settings.back")}
        >
          <ChevronLeft size={24} aria-hidden="true" />
        </button>
        <h1 className="text-lg font-semibold flex-1">{t("listeningHistory.title")}</h1>
        <HistoryIcon size={20} className="text-gray-400" aria-hidden="true" />
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-8 text-center text-gray-500">{t("common.loading")}</div>
        ) : allPlayStatuses.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <HistoryIcon size={48} className="mx-auto mb-4 text-gray-300" aria-hidden="true" />
            <p>{t("listeningHistory.empty")}</p>
          </div>
        ) : (
          <div className="p-8 text-center text-gray-400">{allPlayStatuses.length} entries</div>
        )}
      </div>
    </div>
  );
};
```

(The `{allPlayStatuses.length} entries` placeholder branch is replaced in Task 10 — it exists only so this task's tests can assert the loading/empty states without a TS error on the non-empty branch.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- ListeningHistory --run`
Expected: PASS, all 3 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/components/history/ListeningHistory.tsx src/components/history/ListeningHistory.test.tsx src/services/i18n/locales/fr.json src/services/i18n/locales/en.json
git commit --author="Claude <noreply@anthropic.com>" -m "feat: add ListeningHistory page skeleton (#62)"
```

---

### Task 9: `ListeningHistory.tsx` — stats cards

**Files:**
- Modify: `src/components/history/ListeningHistory.tsx`
- Modify: `src/components/history/ListeningHistory.test.tsx`
- Modify: `src/services/i18n/locales/fr.json`, `en.json`

**Interfaces:**
- Consumes: `computeListeningStats`, `computeStreak` (Tasks 6-7), `db.subscriptions` (Dexie)
- Produces: stats cards rendered inside `ListeningHistory`

- [ ] **Step 1: Write the failing test**

Add to `src/components/history/ListeningHistory.test.tsx`, extend the i18n mock's `translations` map with:

```typescript
        "listeningHistory.totalTime": "Total time",
        "listeningHistory.totalEpisodes": "Episodes",
        "listeningHistory.completed": "Completed",
        "listeningHistory.streak": "Streak",
```

And extend the `mockUseLiveQuery` usage — since the component will now call `useLiveQuery` twice (once for play statuses, once for subscriptions), update `mockUseLiveQuery` to a sequence-aware mock. Replace the top-level mock declaration with:

```typescript
const mockUseLiveQuery = vi.fn();
vi.mock("dexie-react-hooks", () => ({
  useLiveQuery: (fn: () => unknown) => mockUseLiveQuery(fn),
}));

const setLiveQueryData = (playStatuses: unknown, subscriptions: unknown = []) => {
  mockUseLiveQuery.mockImplementation((fn: () => unknown) => {
    const source = fn.toString();
    if (source.includes("getAllPlayStatuses")) return playStatuses;
    return subscriptions;
  });
};
```

Replace every `mockUseLiveQuery.mockReturnValue([])` in the existing tests with `setLiveQueryData([])`, and add:

```typescript
  it("renders stats computed from play statuses", async () => {
    setLiveQueryData(
      [
        {
          episodeId: "a",
          feedUrl: "https://x.com/f",
          position: 120,
          duration: 1000,
          completed: true,
          updatedAt: Date.now(),
        },
      ],
      [],
    );
    render(<ListeningHistory onBack={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText("Streak")).toBeInTheDocument();
    });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- ListeningHistory --run`
Expected: FAIL — `Streak` text not found (stats cards don't exist yet, only the Task 8 placeholder branch renders).

- [ ] **Step 3: Implement**

Replace the placeholder non-empty branch and add stats computation in `src/components/history/ListeningHistory.tsx`. Full new file body:

```typescript
import { useLiveQuery } from "dexie-react-hooks";
import { ChevronLeft, History as HistoryIcon } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { db } from "../../services/storage";
import { getAllPlayStatuses } from "../../services/storage/playStatus";
import { computeListeningStats, computeStreak } from "../../utils/listeningHistory";

interface ListeningHistoryProps {
  onBack: () => void;
}

const formatDuration = (totalSeconds: number): string => {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
};

export const ListeningHistory = ({ onBack }: ListeningHistoryProps) => {
  const { t } = useTranslation();
  const now = Date.now();

  const allPlayStatuses = useLiveQuery(() => getAllPlayStatuses(), []);
  const subscriptions = useLiveQuery(() => db.subscriptions.toArray(), []);
  const isLoading = allPlayStatuses === undefined || subscriptions === undefined;

  const stats = useMemo(() => {
    if (!allPlayStatuses || !subscriptions) return null;
    return {
      ...computeListeningStats(allPlayStatuses, subscriptions),
      streakDays: computeStreak(allPlayStatuses, now),
    };
  }, [allPlayStatuses, subscriptions, now]);

  return (
    <div className="h-full flex flex-col bg-white">
      <div className="flex items-center gap-2 p-4 border-b border-gray-200">
        <button
          type="button"
          onClick={onBack}
          className="p-1 -ml-1 hover:bg-gray-100 rounded-lg"
          aria-label={t("settings.back")}
        >
          <ChevronLeft size={24} aria-hidden="true" />
        </button>
        <h1 className="text-lg font-semibold flex-1">{t("listeningHistory.title")}</h1>
        <HistoryIcon size={20} className="text-gray-400" aria-hidden="true" />
      </div>

      <div className="flex-1 overflow-y-auto pb-16">
        {isLoading ? (
          <div className="p-8 text-center text-gray-500">{t("common.loading")}</div>
        ) : allPlayStatuses.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <HistoryIcon size={48} className="mx-auto mb-4 text-gray-300" aria-hidden="true" />
            <p>{t("listeningHistory.empty")}</p>
          </div>
        ) : (
          stats && (
            <div className="grid grid-cols-2 gap-3 p-4">
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="text-2xl font-bold text-blue-500">
                  {formatDuration(stats.totalTimeSeconds)}
                </div>
                <div className="text-sm text-gray-500 mt-1">{t("listeningHistory.totalTime")}</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="text-2xl font-bold text-gray-900">{stats.totalEpisodes}</div>
                <div className="text-sm text-gray-500 mt-1">{t("listeningHistory.totalEpisodes")}</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="text-2xl font-bold text-green-500">{stats.completedCount}</div>
                <div className="text-sm text-gray-500 mt-1">{t("listeningHistory.completed")}</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="text-2xl font-bold text-orange-500">{stats.streakDays}</div>
                <div className="text-sm text-gray-500 mt-1">{t("listeningHistory.streak")}</div>
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
};
```

Add to `src/services/i18n/locales/fr.json`, inside the `listeningHistory` block:

```json
    "totalTime": "Temps total",
    "totalEpisodes": "Épisodes",
    "completed": "Terminés",
    "streak": "Série"
```

Add to `src/services/i18n/locales/en.json`, inside the `listeningHistory` block:

```json
    "totalTime": "Total time",
    "totalEpisodes": "Episodes",
    "completed": "Completed",
    "streak": "Streak"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- ListeningHistory --run`
Expected: PASS, all tests green (including the previously-updated `setLiveQueryData` calls).

- [ ] **Step 5: Commit**

```bash
git add src/components/history/ListeningHistory.tsx src/components/history/ListeningHistory.test.tsx src/services/i18n/locales/fr.json src/services/i18n/locales/en.json
git commit --author="Claude <noreply@anthropic.com>" -m "feat: add stats cards to ListeningHistory page (#62)"
```

---

### Task 10: `ListeningHistory.tsx` — episode list with feed enrichment and pagination

**Files:**
- Modify: `src/components/history/ListeningHistory.tsx`
- Modify: `src/components/history/ListeningHistory.test.tsx`
- Modify: `src/services/i18n/locales/fr.json`, `en.json`

**Interfaces:**
- Consumes: `getEpisodeStatus` (Task 3), `generateEpisodeId` (`../../services/storage/playStatus`), `fetchAndParseRSS` (`../../services/rss/parser`), `getFallbackTitle` (`../../utils/formatting`), `formatRelativeTime` (`../../utils/formatting`)
- Produces: paginated episode cards, `PAGE_SIZE = 50` constant

- [ ] **Step 1: Write the failing test**

Update the `useQuery` mock in `src/components/history/ListeningHistory.test.tsx` to be controllable per-test — replace the static mock with:

```typescript
const mockUseQuery = vi.fn();
vi.mock("@tanstack/react-query", () => ({
  useQuery: (opts: unknown) => mockUseQuery(opts),
}));
```

And set a default in `beforeEach` (after `mockUseLiveQuery.mockReset()`):

```typescript
    mockUseQuery.mockReturnValue({ data: new Map(), isLoading: false });
```

Add new tests:

```typescript
  it("renders an episode card with title and progress from the fetched feed", async () => {
    const playStatus = {
      episodeId: "ep-1",
      feedUrl: "https://x.com/f",
      position: 300,
      duration: 1000,
      completed: false,
      updatedAt: Date.now(),
    };
    setLiveQueryData([playStatus], []);
    mockUseQuery.mockReturnValue({
      data: new Map([
        [
          "https://x.com/f",
          {
            title: "Feed X",
            description: "",
            image: "https://x.com/cover.jpg",
            url: "https://x.com/f",
            items: [
              {
                title: "Episode One",
                description: "",
                descriptionPreview: "",
                pubDate: "",
                enclosureUrl: "https://x.com/ep1.mp3",
                duration: "1000",
                image: "",
                guid: undefined,
              },
            ],
          },
        ],
      ]),
      isLoading: false,
    });

    render(<ListeningHistory onBack={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText("Episode One")).toBeInTheDocument();
    });
  });

  it("renders a fallback title when the feed isn't available", async () => {
    setLiveQueryData(
      [
        {
          episodeId: "ep-1",
          feedUrl: "https://unreachable.com/f",
          position: 0,
          duration: 0,
          completed: false,
          updatedAt: Date.now(),
        },
      ],
      [],
    );
    mockUseQuery.mockReturnValue({ data: new Map(), isLoading: false });

    render(<ListeningHistory onBack={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText("unreachable.com")).toBeInTheDocument();
    });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- ListeningHistory --run`
Expected: FAIL — neither "Episode One" nor "unreachable.com" render yet (list is still the old placeholder text from Task 8).

- [ ] **Step 3: Implement**

Replace the whole file `src/components/history/ListeningHistory.tsx` with (new imports and the list section added, everything from Task 9 preserved):

```typescript
import { useQuery } from "@tanstack/react-query";
import { useLiveQuery } from "dexie-react-hooks";
import { ChevronLeft, History as HistoryIcon } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { usePlayer } from "../../contexts";
import { fetchAndParseRSS } from "../../services/rss/parser";
import { db } from "../../services/storage";
import { generateEpisodeId, getAllPlayStatuses } from "../../services/storage/playStatus";
import type { Episode, PlayStatus, PodcastFeed } from "../../types";
import { formatRelativeTime, getFallbackTitle } from "../../utils/formatting";
import { computeListeningStats, computeStreak, getEpisodeStatus } from "../../utils/listeningHistory";

interface ListeningHistoryProps {
  onBack: () => void;
}

const PAGE_SIZE = 50;

const formatDuration = (totalSeconds: number): string => {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
};

const formatPosition = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

const statusBadgeClass: Record<string, string> = {
  completed: "bg-green-100 text-green-700",
  inProgress: "bg-blue-100 text-blue-700",
  notStarted: "bg-gray-100 text-gray-500",
};

export const ListeningHistory = ({ onBack }: ListeningHistoryProps) => {
  const { t } = useTranslation();
  const { play } = usePlayer();
  const now = Date.now();

  const allPlayStatuses = useLiveQuery(() => getAllPlayStatuses(), []);
  const subscriptions = useLiveQuery(() => db.subscriptions.toArray(), []);
  const isLoading = allPlayStatuses === undefined || subscriptions === undefined;

  const stats = useMemo(() => {
    if (!allPlayStatuses || !subscriptions) return null;
    return {
      ...computeListeningStats(allPlayStatuses, subscriptions),
      streakDays: computeStreak(allPlayStatuses, now),
    };
  }, [allPlayStatuses, subscriptions, now]);

  // No filters yet (added in Task 11) — for now, page 1 of everything, most recent first.
  const sorted = useMemo(
    () => (allPlayStatuses ? [...allPlayStatuses].sort((a, b) => b.updatedAt - a.updatedAt) : []),
    [allPlayStatuses],
  );
  const pageItems = sorted.slice(0, PAGE_SIZE);

  const pageFeedUrls = useMemo(
    () => [...new Set(pageItems.map((ps) => ps.feedUrl))].sort(),
    [pageItems],
  );
  const feedUrlsKey = pageFeedUrls.join(",");

  const feedQuery = useQuery({
    queryKey: ["listening-history-feeds", feedUrlsKey],
    queryFn: async () => {
      const feeds: Map<string, PodcastFeed> = new Map();
      await Promise.all(
        pageFeedUrls.map(async (url) => {
          try {
            const feed = await fetchAndParseRSS(url);
            feeds.set(url, feed);
          } catch (error) {
            console.error(`Failed to fetch feed ${url}:`, error);
          }
        }),
      );
      return feeds;
    },
    enabled: pageFeedUrls.length > 0,
    staleTime: 1000 * 60 * 5,
  });

  const enrichedPageItems = useMemo(() => {
    const feeds = feedQuery.data;
    return pageItems.map((ps) => {
      const feed = feeds?.get(ps.feedUrl);
      const episode: Episode | undefined = feed?.items.find(
        (ep) => generateEpisodeId(ep.guid, ep.enclosureUrl) === ps.episodeId,
      );
      return {
        playStatus: ps,
        title: episode?.title ?? getFallbackTitle(ps.feedUrl),
        image: episode?.image || feed?.image,
      };
    });
  }, [pageItems, feedQuery.data]);

  return (
    <div className="h-full flex flex-col bg-white">
      <div className="flex items-center gap-2 p-4 border-b border-gray-200">
        <button
          type="button"
          onClick={onBack}
          className="p-1 -ml-1 hover:bg-gray-100 rounded-lg"
          aria-label={t("settings.back")}
        >
          <ChevronLeft size={24} aria-hidden="true" />
        </button>
        <h1 className="text-lg font-semibold flex-1">{t("listeningHistory.title")}</h1>
        <HistoryIcon size={20} className="text-gray-400" aria-hidden="true" />
      </div>

      <div className="flex-1 overflow-y-auto pb-16">
        {isLoading ? (
          <div className="p-8 text-center text-gray-500">{t("common.loading")}</div>
        ) : allPlayStatuses.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <HistoryIcon size={48} className="mx-auto mb-4 text-gray-300" aria-hidden="true" />
            <p>{t("listeningHistory.empty")}</p>
          </div>
        ) : (
          <>
            {stats && (
              <div className="grid grid-cols-2 gap-3 p-4">
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="text-2xl font-bold text-blue-500">
                    {formatDuration(stats.totalTimeSeconds)}
                  </div>
                  <div className="text-sm text-gray-500 mt-1">{t("listeningHistory.totalTime")}</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="text-2xl font-bold text-gray-900">{stats.totalEpisodes}</div>
                  <div className="text-sm text-gray-500 mt-1">
                    {t("listeningHistory.totalEpisodes")}
                  </div>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="text-2xl font-bold text-green-500">{stats.completedCount}</div>
                  <div className="text-sm text-gray-500 mt-1">{t("listeningHistory.completed")}</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="text-2xl font-bold text-orange-500">{stats.streakDays}</div>
                  <div className="text-sm text-gray-500 mt-1">{t("listeningHistory.streak")}</div>
                </div>
              </div>
            )}

            <div className="divide-y divide-gray-200">
              {enrichedPageItems.map(({ playStatus, title, image }) => {
                const status = getEpisodeStatus(playStatus);
                const progress =
                  playStatus.duration > 0 ? (playStatus.position / playStatus.duration) * 100 : 0;

                return (
                  <button
                    type="button"
                    key={playStatus.episodeId}
                    onClick={() => {
                      /* wired in Task 12 */
                    }}
                    className="w-full text-left px-4 py-3 hover:bg-gray-50 active:bg-gray-100"
                  >
                    <div className="flex gap-3">
                      <img
                        src={image}
                        alt={title}
                        className="w-14 h-14 rounded-lg object-cover bg-gray-200 flex-shrink-0"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.visibility = "hidden";
                        }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm mb-0.5 line-clamp-1 text-gray-900">
                          {title}
                        </div>
                        <div className="flex items-center gap-2 mb-1">
                          <span
                            className={`text-xs px-1.5 py-0.5 rounded ${statusBadgeClass[status]}`}
                          >
                            {t(`listeningHistory.status.${status}`)}
                          </span>
                          <span className="text-xs text-gray-400">
                            {formatRelativeTime(playStatus.updatedAt, t, now)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full bg-blue-500"
                              style={{ width: `${Math.min(progress, 100)}%` }}
                            />
                          </div>
                          <span className="text-xs text-gray-400 flex-shrink-0">
                            {formatPosition(playStatus.position)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
```

Add to `src/services/i18n/locales/fr.json`, inside the `listeningHistory` block, as the last key (after `"streak": "Série"`, remembering to add a comma after it):

```json
    "status": {
      "completed": "Terminé",
      "inProgress": "En cours",
      "notStarted": "Non débuté"
    }
```

Add to `src/services/i18n/locales/en.json`, same position:

```json
    "status": {
      "completed": "Completed",
      "inProgress": "In progress",
      "notStarted": "Not started"
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- ListeningHistory --run`
Expected: PASS, all tests green.

- [ ] **Step 5: Commit**

```bash
git add src/components/history/ListeningHistory.tsx src/components/history/ListeningHistory.test.tsx src/services/i18n/locales/fr.json src/services/i18n/locales/en.json
git commit --author="Claude <noreply@anthropic.com>" -m "feat: add paginated episode list with feed enrichment (#62)"
```

---

### Task 11: `ListeningHistory.tsx` — filter bar (podcast/period/status) and pagination controls

**Files:**
- Modify: `src/components/history/ListeningHistory.tsx`
- Modify: `src/components/history/ListeningHistory.test.tsx`
- Modify: `src/services/i18n/locales/fr.json`, `en.json`

**Interfaces:**
- Consumes: `filterPlayStatuses`, `HistoryFilters`, `Period` (Task 5)
- Produces: working filter UI + prev/next pagination + distinct "no results for filters" empty state

- [ ] **Step 1: Write the failing test**

Add to the i18n mock's `translations` map in the test file:

```typescript
        "listeningHistory.filter.allPodcasts": "All podcasts",
        "listeningHistory.filter.allPeriods": "All time",
        "listeningHistory.filter.week": "Week",
        "listeningHistory.filter.month": "Month",
        "listeningHistory.filter.year": "Year",
        "listeningHistory.filter.allStatuses": "All",
        "listeningHistory.status.completed": "Completed",
        "listeningHistory.status.inProgress": "In progress",
        "listeningHistory.status.notStarted": "Not started",
        "listeningHistory.noResults": "No results for these filters",
        "listeningHistory.pageOf": "Page {{page}} of {{total}}",
```

(Note: `listeningHistory.status.*` keys were already needed by Task 10's badge rendering — if they aren't already in the mock's `translations` map from that task, add them now.)

Add new tests:

```typescript
  it("filters the list by status", async () => {
    setLiveQueryData(
      [
        { episodeId: "a", feedUrl: "https://x.com/f", position: 0, duration: 1000, completed: false, updatedAt: Date.now() },
        { episodeId: "b", feedUrl: "https://x.com/f", position: 500, duration: 1000, completed: true, updatedAt: Date.now() },
      ],
      [],
    );
    render(<ListeningHistory onBack={vi.fn()} />);

    await waitFor(() => expect(screen.getAllByTestId("history-row")).toHaveLength(2));
    screen.getByRole("button", { name: "Completed" }).click();

    await waitFor(() => {
      expect(screen.getAllByTestId("history-row")).toHaveLength(1);
    });
  });

  it("shows a distinct empty state when filters exclude every entry", async () => {
    setLiveQueryData(
      [
        {
          episodeId: "a",
          feedUrl: "https://x.com/f",
          position: 0,
          duration: 1000,
          completed: false,
          updatedAt: Date.now(),
        },
      ],
      [],
    );
    render(<ListeningHistory onBack={vi.fn()} />);
    await waitFor(() => expect(screen.getAllByTestId("history-row")).toHaveLength(1));

    screen.getByRole("button", { name: "Completed" }).click();

    await waitFor(() => {
      expect(screen.getByText("No results for these filters")).toBeInTheDocument();
    });
  });
```

This requires a `data-testid="history-row"` on each episode row — added in the implementation step below.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- ListeningHistory --run`
Expected: FAIL — no filter buttons exist yet (`getByRole("button", { name: "Completed" })` throws), and no `data-testid="history-row"` exists.

- [ ] **Step 3: Implement**

In `src/components/history/ListeningHistory.tsx`:

1. Add imports: `useState, useEffect` from `"react"` (alongside the existing `useMemo` import), and `filterPlayStatuses, type HistoryFilters, type Period` from `"../../utils/listeningHistory"` (alongside the existing `computeListeningStats, computeStreak, getEpisodeStatus` import).

2. Add state and replace the unfiltered `sorted`/`pageItems` logic:

```typescript
  const [filterFeed, setFilterFeed] = useState("");
  const [filterPeriod, setFilterPeriod] = useState<Period>("");
  const [filterStatus, setFilterStatus] = useState<HistoryFilters["status"]>("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [filterFeed, filterPeriod, filterStatus]);

  const filtered = useMemo(() => {
    if (!allPlayStatuses) return [];
    return filterPlayStatuses(
      allPlayStatuses,
      { feedUrl: filterFeed, period: filterPeriod, status: filterStatus },
      now,
    );
  }, [allPlayStatuses, filterFeed, filterPeriod, filterStatus, now]);

  const totalPages = Math.max(Math.ceil(filtered.length / PAGE_SIZE), 1);
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
```

Remove the old `sorted` `useMemo` block entirely (superseded by `filtered`).

3. Add the filter bar JSX right after the header `</div>`, before the loading/empty/content conditional `<div className="flex-1 overflow-y-auto pb-16">`:

```typescript
      <div className="flex flex-col gap-2 p-4 border-b border-gray-200">
        <select
          value={filterFeed}
          onChange={(e) => setFilterFeed(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-2 py-1.5"
        >
          <option value="">{t("listeningHistory.filter.allPodcasts")}</option>
          {(subscriptions ?? []).map((sub) => (
            <option key={sub.url} value={sub.url}>
              {sub.title || getFallbackTitle(sub.url)}
            </option>
          ))}
        </select>

        <div className="flex gap-2">
          {(["", "week", "month", "year"] as const).map((p) => (
            <button
              type="button"
              key={p || "all"}
              onClick={() => setFilterPeriod(p)}
              aria-pressed={filterPeriod === p}
              className={`px-3 py-1.5 rounded-full text-sm font-medium ${
                filterPeriod === p ? "bg-blue-500 text-white" : "bg-gray-100 text-gray-600"
              }`}
            >
              {p ? t(`listeningHistory.filter.${p}`) : t("listeningHistory.filter.allPeriods")}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          {(["", "completed", "inProgress", "notStarted"] as const).map((s) => (
            <button
              type="button"
              key={s || "all"}
              onClick={() => setFilterStatus(s)}
              aria-pressed={filterStatus === s}
              className={`px-3 py-1.5 rounded-full text-sm font-medium ${
                filterStatus === s ? "bg-blue-500 text-white" : "bg-gray-100 text-gray-600"
              }`}
            >
              {s ? t(`listeningHistory.status.${s}`) : t("listeningHistory.filter.allStatuses")}
            </button>
          ))}
        </div>
      </div>
```

4. Add `data-testid="history-row"` to the episode row `<button>` (the one mapping `enrichedPageItems`).

5. Replace the empty-state branch to distinguish "no history at all" from "filters exclude everything":

```typescript
        ) : allPlayStatuses.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <HistoryIcon size={48} className="mx-auto mb-4 text-gray-300" aria-hidden="true" />
            <p>{t("listeningHistory.empty")}</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-gray-500">{t("listeningHistory.noResults")}</div>
        ) : (
```

6. After the `</div>` closing the `divide-y` episode list, still inside the same fragment, add pagination controls:

```typescript
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-4 p-4">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="px-3 py-1.5 rounded-full text-sm bg-gray-100 disabled:opacity-40"
                >
                  {t("common.previous")}
                </button>
                <span className="text-sm text-gray-500">
                  {t("listeningHistory.pageOf", { page, total: totalPages })}
                </span>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="px-3 py-1.5 rounded-full text-sm bg-gray-100 disabled:opacity-40"
                >
                  {t("common.next")}
                </button>
              </div>
            )}
```

7. `pageFeedUrls`/`feedQuery`/`enrichedPageItems` already reference `pageItems`, which now comes from the filtered+paginated slice — no further change needed there.

Check whether `common.previous`/`common.next` already exist:

Run: `grep -n '"previous"\|"next"' src/services/i18n/locales/fr.json`

If they don't exist, add them to the existing `"common"` block in both locale files:
- fr.json: `"previous": "Précédent", "next": "Suivant"`
- en.json: `"previous": "Previous", "next": "Next"`

Add to `src/services/i18n/locales/fr.json`, inside the `listeningHistory` block (after `"status"`, remember trailing comma placement):

```json
    "filter": {
      "allPodcasts": "Tous les podcasts",
      "allPeriods": "Toute la période",
      "week": "Semaine",
      "month": "Mois",
      "year": "Année",
      "allStatuses": "Tous"
    },
    "noResults": "Aucun résultat pour ces filtres",
    "pageOf": "Page {{page}} sur {{total}}"
```

Add to `src/services/i18n/locales/en.json`, same position:

```json
    "filter": {
      "allPodcasts": "All podcasts",
      "allPeriods": "All time",
      "week": "Week",
      "month": "Month",
      "year": "Year",
      "allStatuses": "All"
    },
    "noResults": "No results for these filters",
    "pageOf": "Page {{page}} of {{total}}"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- ListeningHistory --run`
Expected: PASS, all tests green.

- [ ] **Step 5: Commit**

```bash
git add src/components/history/ListeningHistory.tsx src/components/history/ListeningHistory.test.tsx src/services/i18n/locales/fr.json src/services/i18n/locales/en.json
git commit --author="Claude <noreply@anthropic.com>" -m "feat: add filter bar and pagination to ListeningHistory (#62)"
```

---

### Task 12: `ListeningHistory.tsx` — tap to resume playback

**Files:**
- Modify: `src/components/history/ListeningHistory.tsx`
- Modify: `src/components/history/ListeningHistory.test.tsx`

**Interfaces:**
- Consumes: `usePlayer().play(episode: Episode, feedUrl: string): void` (existing, from `../../contexts`)

- [ ] **Step 1: Write the failing test**

Replace the top-level `../../contexts` mock in the test file with a controllable one:

```typescript
const mockPlay = vi.fn();
vi.mock("../../contexts", () => ({
  usePlayer: () => ({ play: mockPlay, currentEpisode: null, isPlaying: false }),
}));
```

Add `mockPlay.mockReset();` to `beforeEach`. Then add:

```typescript
  it("resumes playback when a card with a resolved episode is tapped", async () => {
    setLiveQueryData(
      [
        {
          episodeId: "ep-1",
          feedUrl: "https://x.com/f",
          position: 300,
          duration: 1000,
          completed: false,
          updatedAt: Date.now(),
        },
      ],
      [],
    );
    mockUseQuery.mockReturnValue({
      data: new Map([
        [
          "https://x.com/f",
          {
            title: "Feed X",
            description: "",
            image: "",
            url: "https://x.com/f",
            items: [
              {
                title: "Episode One",
                description: "",
                descriptionPreview: "",
                pubDate: "",
                enclosureUrl: "https://x.com/ep1.mp3",
                duration: "1000",
                image: "",
                guid: undefined,
              },
            ],
          },
        ],
      ]),
      isLoading: false,
    });

    render(<ListeningHistory onBack={vi.fn()} />);
    await waitFor(() => screen.getByText("Episode One"));
    screen.getByTestId("history-row").click();

    expect(mockPlay).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Episode One" }),
      "https://x.com/f",
    );
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- ListeningHistory --run`
Expected: FAIL — `mockPlay` not called (the row's `onClick` is still the empty placeholder from Task 10).

- [ ] **Step 3: Implement**

In `src/components/history/ListeningHistory.tsx`, change the `enrichedPageItems` mapping to also carry the resolved `Episode` object (not just title/image):

```typescript
  const enrichedPageItems = useMemo(() => {
    const feeds = feedQuery.data;
    return pageItems.map((ps) => {
      const feed = feeds?.get(ps.feedUrl);
      const episode: Episode | undefined = feed?.items.find(
        (ep) => generateEpisodeId(ep.guid, ep.enclosureUrl) === ps.episodeId,
      );
      return {
        playStatus: ps,
        episode,
        title: episode?.title ?? getFallbackTitle(ps.feedUrl),
        image: episode?.image || feed?.image,
      };
    });
  }, [pageItems, feedQuery.data]);
```

And update the row's destructuring and `onClick`:

```typescript
              {enrichedPageItems.map(({ playStatus, episode, title, image }) => {
                const status = getEpisodeStatus(playStatus);
                const progress =
                  playStatus.duration > 0 ? (playStatus.position / playStatus.duration) * 100 : 0;

                return (
                  <button
                    type="button"
                    key={playStatus.episodeId}
                    data-testid="history-row"
                    onClick={() => {
                      if (episode) play(episode, playStatus.feedUrl);
                    }}
                    className="w-full text-left px-4 py-3 hover:bg-gray-50 active:bg-gray-100"
                  >
```

(`play` is already destructured from `usePlayer()` at the top of the component since Task 10.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- ListeningHistory --run`
Expected: PASS, all tests green.

- [ ] **Step 5: Commit**

```bash
git add src/components/history/ListeningHistory.tsx src/components/history/ListeningHistory.test.tsx
git commit --author="Claude <noreply@anthropic.com>" -m "feat: resume playback on tap in ListeningHistory (#62)"
```

---

### Task 13: Wire navigation — ViewId, Library button, App.tsx routing

**Files:**
- Modify: `src/types/index.ts:100`
- Modify: `src/components/library/Library.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `ListeningHistory` component (Task 12)
- Produces: reachable page via a Library header button

No dedicated test file for this task — `App.tsx` and `Library.tsx` have no existing test coverage at this integration level in this codebase (confirmed: no `App.test.tsx`, no `Library.test.tsx` exist), so this task follows that established convention rather than introducing new test infrastructure inconsistent with the rest of the app. Verified manually via the full test/build/lint run in Task 14 instead.

- [ ] **Step 1: Update the `ViewId` type**

In `src/types/index.ts:100`, change:

```typescript
export type ViewId = TabId | "podcast" | "settings" | "stats" | "inProgress";
```

to:

```typescript
export type ViewId = TabId | "podcast" | "settings" | "stats" | "inProgress" | "listeningHistory";
```

- [ ] **Step 2: Add the nav button in Library.tsx**

In `src/components/library/Library.tsx`, add `History` to the lucide-react import (line 2):

```typescript
import { Clock, Headphones, History, Plus, Settings, X } from "lucide-react";
```

Add this button right after the closing `)}` of the `inProgressCount` conditional block (after line 82, before the "add subscription" button at line 83):

```typescript
            <button
              type="button"
              onClick={() => onNavigate("listeningHistory")}
              className="text-gray-500 w-8 h-8 flex items-center justify-center hover:bg-gray-100 rounded-lg"
              title={t("listeningHistory.title")}
              aria-label={t("listeningHistory.title")}
            >
              <History size={20} />
            </button>
```

- [ ] **Step 3: Wire the view in App.tsx**

In `src/App.tsx`, add the import (alphabetically among the existing component imports, after `InProgress`):

```typescript
import { ListeningHistory } from "./components/history/ListeningHistory";
```

Add a case in `renderContent()`, right after the `"inProgress"` block (after line 71):

```typescript
    if (currentView === "listeningHistory") {
      return <ListeningHistory onBack={() => handleNavigate("library")} />;
    }
```

- [ ] **Step 4: Verify manually**

Run: `npm run build`
Expected: succeeds, no TypeScript errors (confirms `ViewId`, imports, and prop types all line up).

Run: `npm test -- --run`
Expected: all existing tests still pass (no regressions from the wiring changes).

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts src/components/library/Library.tsx src/App.tsx
git commit --author="Claude <noreply@anthropic.com>" -m "feat: wire ListeningHistory into navigation from Library (#62)"
```

---

### Task 14: Final verification pass

**Files:** none (verification only)

- [ ] **Step 1: Full test suite**

Run: `npm test -- --run`
Expected: all test files pass, including `formatting.test.ts`, `listeningHistory.test.ts`, `ListeningHistory.test.tsx`, `playStatus.test.ts`, `Stats.test.tsx`, and every pre-existing test file (no regressions).

- [ ] **Step 2: Lint**

Run: `npm run lint:fix`
Expected: clean, no unfixable issues. If any files were reformatted, `git add` and fold into the next commit.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: `tsc -b && vite build` succeeds with no type errors.

- [ ] **Step 4: i18n completeness check**

Run: `node -e "const fr=require('./src/services/i18n/locales/fr.json'); const en=require('./src/services/i18n/locales/en.json'); const flat=(o,p='')=>Object.entries(o).flatMap(([k,v])=>typeof v==='object'?flat(v,p+k+'.'):[p+k]); const frKeys=new Set(flat(fr)); const enKeys=new Set(flat(en)); const missing=[...frKeys].filter(k=>!enKeys.has(k)).concat([...enKeys].filter(k=>!frKeys.has(k))); if(missing.length){console.log('MISSING:', missing); process.exit(1)} console.log('OK: fr/en key sets match');"`

Expected: `OK: fr/en key sets match`. If it prints `MISSING: [...]`, add the missing key(s) to whichever locale file is missing them before proceeding.

- [ ] **Step 5: Cross-check against the spec's "Files touched" list**

Open `docs/superpowers/specs/2026-07-02-listening-history-design.md`'s "Files touched" section and confirm every listed file was actually created/modified. If anything was missed, address it now before moving to review.

- [ ] **Step 6: Commit (if Step 2 produced changes)**

```bash
git add -A
git commit --author="Claude <noreply@anthropic.com>" -m "chore: lint fixes for listening history feature (#62)"
```
