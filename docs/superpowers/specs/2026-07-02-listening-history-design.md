# Listening History Page — Design

**Issue:** [podCloud/balados.app#62](https://github.com/podCloud/balados.app/issues/62)
**Date:** 2026-07-02
**Status:** Approved

## Context

The backend (balados.sync) already ships a detailed listening history page
(issue #200 / PR #252) with filters, aggregate stats, and pagination, all
computed server-side from the `PlayStatus` projection. balados.app needs an
equivalent, but computed entirely client-side from the local `playStatuses`
Dexie table — no new API calls, no schema changes.

The issue asks for UX parity with the backend page, so this design mirrors
its filter semantics, stats definitions, and streak algorithm exactly
(extracted from `balados.sync/apps/balados_sync_web/lib/balados_sync_web/queries.ex`
and `listening_history_live.ex`), reimplemented as pure client-side logic.

## Scope

In scope (from the issue's acceptance criteria):
- Listening history page reachable from the app navigation
- Filters: podcast, time period (week/month/year), status (completed/in
  progress/not started)
- Stats: total listening time, total episodes with activity, completed
  count, listening streak, top 5 podcasts by episode count
- Paginated episode list with cover, title, progress bar, status badge,
  relative time

Out of scope (not requested by the issue, not built):
- CSV/JSON export (exists on the backend page, not asked for here)
- True list virtualization (no precedent in the codebase; local dataset
  size doesn't warrant it — see "Pagination" below)

## Navigation entry point

A button in `Library.tsx`'s header, next to the existing "In Progress"
button, using the `History` icon from `lucide-react`. Unlike "In Progress"
(only shown when `inProgressCount > 0`), this button is always visible —
it's a navigation entry, not a notification badge.

Wiring: add `"listeningHistory"` to the `ViewId` type in `src/types/index.ts`,
add a case in `App.tsx`'s `renderContent()`, following the exact pattern
already used for `"inProgress"` and `"stats"`.

## Data source

No schema changes. Reuses:
- `db.playStatuses` (existing Dexie table, indexed on `episodeId, feedUrl,
  updatedAt`)
- `db.subscriptions` (existing table) for podcast title/image enrichment,
  via the same fallback-to-hostname pattern already used in `Stats.tsx`

One new storage function in `src/services/storage/playStatus.ts`:

```typescript
export const getAllPlayStatuses = (): Promise<PlayStatus[]> => db.playStatuses.toArray();
```

## Business logic — `src/utils/listeningHistory.ts` (pure module)

Filtering, status derivation, stats aggregation, and streak calculation
live in a pure, framework-free module — not inline in the component — so
the trickiest logic (date boundaries, streak edge cases) is unit-testable
without mocking Dexie or React. Mirrors the separation already used for
`utils/rssEncoding.ts`.

### Status derivation

Matches `status_badge_class`/`status_label` in `listening_history_live.ex`:

```typescript
type HistoryStatus = "completed" | "inProgress" | "notStarted";

function getEpisodeStatus(ps: PlayStatus): HistoryStatus {
  if (ps.completed) return "completed";
  if (ps.position > 0) return "inProgress";
  return "notStarted";
}
```

### Period filter

Matches `listening_history_base_query`'s period clause — a rolling window
from "now", **not** a calendar-aligned bucket:

```typescript
type Period = "week" | "month" | "year" | "";

const PERIOD_DAYS: Record<Exclude<Period, "">, number> = { week: 7, month: 30, year: 365 };

function isWithinPeriod(updatedAt: number, period: Period, now: number): boolean {
  if (!period) return true;
  const cutoff = now - PERIOD_DAYS[period] * 24 * 60 * 60 * 1000;
  return updatedAt >= cutoff;
}
```

`now` is passed in (not read via `Date.now()` inside the function) so the
function stays pure and trivially testable with fixed timestamps.

### Combined filter

```typescript
interface HistoryFilters {
  feedUrl: string;   // "" = all
  period: Period;    // "" = all
  status: HistoryStatus | "";  // "" = all
}

function filterPlayStatuses(all: PlayStatus[], filters: HistoryFilters, now: number): PlayStatus[] {
  return all
    .filter((ps) => !filters.feedUrl || ps.feedUrl === filters.feedUrl)
    .filter((ps) => isWithinPeriod(ps.updatedAt, filters.period, now))
    .filter((ps) => !filters.status || getEpisodeStatus(ps) === filters.status)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}
```

### Stats — computed on the full, unfiltered set

Matches `get_listening_stats/1`: stats are **global**, independent of
whatever filters are currently applied to the list (confirmed by reading
the backend query — `base_query` for stats has no period/status/feed
clauses applied). This means changing a filter updates the list but not
the stat cards.

```typescript
interface ListeningStats {
  totalTimeSeconds: number;   // sum of position across all rows
  totalEpisodes: number;      // count of all rows
  completedCount: number;     // count where completed === true
  streakDays: number;
  topPodcasts: Array<{ feedUrl: string; title: string; count: number }>; // top 5
}

function computeListeningStats(all: PlayStatus[], subscriptions: Subscription[], now: number): ListeningStats
```

`topPodcasts` groups by `feedUrl`, counts rows, sorts descending, takes 5;
title resolved via the subscriptions map with the existing hostname
fallback (same helper `Stats.tsx` already uses).

### Streak

Matches `compute_listening_streak/1` exactly:

```typescript
// Local calendar day, as a comparable integer key (year*10000 + month*100 + day).
function dayKey(timestamp: number): number {
  const d = new Date(timestamp);
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

function daysBetween(a: number, b: number): number {
  // a, b are dayKey-style dates recomputed as real Date objects at local midnight,
  // so DST transitions don't skew the day count.
  const da = new Date(Math.floor(a / 10000), Math.floor((a % 10000) / 100) - 1, a % 100);
  const db_ = new Date(Math.floor(b / 10000), Math.floor((b % 10000) / 100) - 1, b % 100);
  return Math.round((da.getTime() - db_.getTime()) / (24 * 60 * 60 * 1000));
}

function computeStreak(all: PlayStatus[], now: number): number {
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
}
```

**Known limitation (matches the backend's own documented caveat):** day
boundaries use the browser's local timezone via `Date`, not UTC. The
backend uses Postgres `DATE()` in UTC and documents the same class of
edge case near midnight for non-UTC users. Client-side local time is
arguably the more correct choice for a client-only feature (matches what
the user actually perceives as "today"), so this isn't a bug to fix, just
a documented behavioral difference from the backend — noted inline in the
code comment, not hidden.

## Component — `src/components/history/ListeningHistory.tsx`

Single component (no premature sub-component extraction), structured as:

1. **Header** — back button + title, same pattern as `InProgress.tsx`.
2. **Stats cards** — grid of cards (total time formatted as `Xh Ym`, total
   episodes, completed count, streak in days, top 5 podcasts list),
   styled like `Stats.tsx`'s existing stat cards.
3. **Filter bar**:
   - Podcast: native `<select>` populated from `db.subscriptions`
     (title-or-fallback), default option = "All". A native select is used
     deliberately — no dropdown/combobox component exists anywhere in the
     codebase, and inventing one for a single filter isn't justified.
   - Period: segmented buttons (all/week/month/year), reusing the exact
     button-group visual pattern from `Stats.tsx`'s period selector.
   - Status: segmented buttons (all/completed/inProgress/notStarted), same
     visual pattern.
4. **Episode list** — paginated slice of the filtered results, one card per
   entry: episode/podcast cover image (with fallback), episode title,
   progress bar (`position / duration`), status badge (color-coded per
   `getEpisodeStatus`), relative time (reuse `formatRelativeTime` from
   `Stats.tsx`). Tapping a card resumes playback via `usePlayer().play()`,
   consistent with `InProgress.tsx`'s tap-to-play behavior.

   **Correction from initial draft:** `PlayStatus` rows only store
   `episodeId, feedUrl, position, duration, completed, updatedAt` — no
   episode title or image. `InProgress.tsx` resolves those by fetching/
   parsing the RSS feed for each distinct `feedUrl` (`getCachedFeed` →
   `fetchAndParseRSS` fallback, via `useQuery`) and matching
   `playStatus.episodeId` against `feed.items` through
   `generateEpisodeId`. This page reuses the exact same pattern, scoped to
   only the feed URLs present on the **current page** of results (not the
   whole history) to keep the fetch set small. If a feed fails to fetch or
   an episode is no longer present in it, the card still renders using
   only local data (feedUrl-derived fallback title, no image, status
   badge, progress, relative time) — see "Error / empty states" below.
5. **Pagination controls** — prev/next buttons + "page X of Y" label.
   `PAGE_SIZE = 50` (matches the backend's `@per_page`). Implemented as an
   in-memory slice of the already-filtered array — see "Pagination"
   below for why this doesn't need real virtualization.

### Data flow

```
useLiveQuery(getAllPlayStatuses)         → allPlayStatuses
useLiveQuery(db.subscriptions.toArray)   → subscriptions
useState: filterFeed, filterPeriod, filterStatus, page

useMemo: stats = computeListeningStats(allPlayStatuses, subscriptions, now)
useMemo: filtered = filterPlayStatuses(allPlayStatuses, {feedUrl: filterFeed, period: filterPeriod, status: filterStatus}, now)
useMemo: pageItems = filtered.slice((page-1)*PAGE_SIZE, page*PAGE_SIZE)
useEffect: reset page to 1 whenever filterFeed/filterPeriod/filterStatus changes

useMemo: pageFeedUrls = unique feedUrls in pageItems (sorted, for a stable query key — same pattern as InProgress.tsx)
useQuery(["listening-history-feeds", pageFeedUrls.join(",")]) → Map<feedUrl, PodcastFeed>, fetched via getCachedFeed/fetchAndParseRSS per feedUrl (same as InProgress.tsx), enabled: pageFeedUrls.length > 0
useMemo: enrichedPageItems = pageItems mapped to { playStatus, title, image } — title/image resolved by matching generateEpisodeId(episode.guid, episode.enclosureUrl) against the fetched feed's items when available, falling back to the subscription's title/image, then to getFallbackTitle(feedUrl)/no image
```

`now` is captured once per render via a plain `Date.now()` call at the top
of the component (not per-row), so filtering/streak stay consistent within
a single render pass.

### Pagination — why in-memory slicing is enough

The exploration confirmed there's no virtualization precedent anywhere in
the codebase, and per-user listening history is bounded by realistic usage
(one person's play history over years — thousands of rows at most, not
millions). Loading the full `playStatuses` table into memory (as `Stats.tsx`
already effectively does for its own aggregates) and slicing in JS is the
YAGNI-consistent choice. If this ever becomes a real problem, the `updatedAt`
Dexie index would allow windowed queries — noted here for future reference,
not implemented now.

## Error / empty states

- **No listening history at all** (`allPlayStatuses.length === 0`): empty
  state message, matching `InProgress.tsx`'s empty-state pattern.
- **Filters applied, no matches** (`filtered.length === 0` but
  `allPlayStatuses.length > 0`): a distinct "no results for these filters"
  message, so the user doesn't confuse "you've never listened to anything"
  with "no results match your current filters."
- **Feed fetch failure or episode no longer in feed** (revised — this page
  *does* make network calls, via the same feed-fetch pattern as
  `InProgress.tsx`): the card still renders from local data alone
  (feedUrl-derived fallback title, no image, status badge, progress bar,
  relative time all work without the feed). No error banner — a missing
  title/image degrades gracefully rather than blocking the row, exactly
  like `InProgress.tsx`'s existing image `onError` fallback behavior.

## i18n

New `listeningHistory` namespace in `locales/fr.json`/`en.json`, following
the existing nesting + `_other` pluralization convention (see `stats` and
`inProgress` namespaces for the pattern).

## Testing plan

- **`src/utils/listeningHistory.test.ts`** — exhaustive unit tests, no
  mocking needed (pure functions):
  - `getEpisodeStatus`: completed / in-progress / not-started
  - `isWithinPeriod`: inside window, exactly at boundary, outside window,
    no period (passthrough)
  - `filterPlayStatuses`: each filter independently and combined
  - `computeListeningStats`: totals, completed count, top-5 ordering and
    truncation, ties
  - `computeStreak`: no activity (0), activity today (streak continues),
    activity only yesterday (streak continues), gap of exactly 2 days
    (streak resets to 0), multi-day consecutive run, non-consecutive dates
    interspersed with consecutive ones
- **`src/components/history/ListeningHistory.test.tsx`** — component test
  following `InProgress.test.tsx`'s pattern (mock `useLiveQuery`, mock
  `useQuery` for feed data, mock `playStatus`/`subscriptions` storage
  functions, mock `usePlayer`): filter interactions update the visible
  list, pagination controls work and reset on filter change, stat cards
  render the computed values, empty states render correctly, tapping a
  card calls `play()`, a card still renders (fallback title, no image)
  when its feed isn't in the mocked `useQuery` data.

## Files touched

- `src/types/index.ts` — add `"listeningHistory"` to `ViewId`
- `src/App.tsx` — wire the new view
- `src/components/library/Library.tsx` — add nav button
- `src/components/history/ListeningHistory.tsx` (new)
- `src/components/history/ListeningHistory.test.tsx` (new)
- `src/services/storage/playStatus.ts` — add `getAllPlayStatuses`
- `src/utils/listeningHistory.ts` (new)
- `src/utils/listeningHistory.test.ts` (new)
- `src/utils/formatting.ts` (new) — `getFallbackTitle`/`formatRelativeTime`
  extracted out of `Stats.tsx` (both were private, unexported helpers there)
  so `listeningHistory.ts` and `ListeningHistory.tsx` can reuse them instead
  of duplicating; DRY-driven, decided while writing the implementation plan
- `src/utils/formatting.test.ts` (new)
- `src/components/stats/Stats.tsx` — updated to import from `utils/formatting`
  instead of its own local copies (no behavior change)
- `src/services/i18n/locales/fr.json`, `en.json` — new `listeningHistory` keys
