# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**balados.app** is a French-language web podcast player (PWA) that works offline-first and can optionally connect to a balados.sync server for cross-device synchronization (similar to Bluesky/Mastodon federated client model).

**Core Principles:**
- **Offline-first**: Everything stored locally, sync is optional
- **Data ownership**: User can add/remove sync without losing data
- **Progressive enhancement**: Works standalone, better with sync server

## Development Commands

```bash
npm run dev       # Start development server with HMR
npm run build     # Type-check with tsc and build with Vite
npm run lint      # Run ESLint on all TypeScript files
npm run preview   # Preview production build
npm test          # Run tests (Vitest)
npm test -- --watch  # Watch mode
```

## Tech Stack

- **React 19** with TypeScript
- **Vite 7** as build tool
- **Tailwind CSS** via @tailwindcss/vite plugin
- **ESLint 9** with flat config format
- **Vitest** + Testing Library for tests
- **TanStack Query** (React Query) for data fetching
- **Service Worker** for PWA & background sync

## Code Conventions

### Naming

| Type | Convention | Example |
|------|------------|---------|
| Files/folders | camelCase | `useQuery.ts`, `rssService.ts` |
| React components | PascalCase | `EpisodePlayer.tsx` |
| Variables/functions | camelCase | `fetchPodcast()`, `playStatus` |
| API data (external) | snake_case when obvious | `rss_source_feed` |
| CSS | Tailwind utilities only | - |

### Git

**Branch naming:**
```
feature/issue-<number>-<slug>
fix/issue-<number>-<slug>
```

**Commits (Conventional Commits):**
```
feat: add episode player component
fix: correct RSS parsing for iTunes feeds
refactor: extract storage service
docs: update API integration docs
chore: add vitest configuration
```

**Commit author:**
```bash
git commit --author="Claude <noreply@anthropic.com>" -m "message"
```

### PR Review Workflow

**IMPORTANT**: When checking PR status, always read the full comments/reviews, not just the CI check status:

```bash
# Check for review comments (ALWAYS do this first)
gh pr view <number> --comments

# Then check CI status
gh pr checks <number>
```

A PR is ready to merge only when:
1. CI checks pass (`claude-review` shows `pass`)
2. Review comments indicate **no critical issues** remaining
3. If issues were raised, they must be fixed and a new review requested

The `claude-review` CI check passing alone is NOT sufficient - the review content must explicitly approve or show no blocking issues.

## Architecture

### Target Structure

```
src/
├── components/
│   ├── library/
│   │   ├── Library.tsx
│   │   └── SubscriptionItem.tsx
│   ├── player/
│   │   ├── EpisodePlayer.tsx
│   │   └── PlayerControls.tsx
│   ├── podcast/
│   │   ├── PodcastDetail.tsx
│   │   └── EpisodeList.tsx
│   ├── settings/
│   │   ├── Settings.tsx
│   │   ├── SyncSettings.tsx
│   │   └── ProxySettings.tsx
│   ├── stats/
│   │   └── LocalStats.tsx
│   └── ui/
│       └── (shared components)
├── hooks/
│   ├── useLocalStorage.ts
│   ├── useSync.ts
│   └── useOffline.ts
├── services/
│   ├── storage/
│   │   ├── index.ts          # Storage abstraction
│   │   ├── subscriptions.ts
│   │   ├── playStatus.ts
│   │   └── events.ts         # Local event log for stats
│   ├── rss/
│   │   ├── parser.ts
│   │   └── proxyManager.ts   # Multi-proxy with fallback
│   ├── sync/
│   │   ├── client.ts         # balados.sync API client
│   │   ├── merger.ts         # Conflict resolution
│   │   └── queue.ts          # Offline action queue
│   └── i18n/
│       ├── index.ts
│       └── locales/
│           ├── fr.json
│           └── en.json
├── types/
│   └── index.ts
├── workers/
│   └── sw.ts                 # Service Worker
├── App.tsx
└── main.tsx
```

## Key Features

### 1. Local-First Storage

All data persisted in IndexedDB/localStorage:
- Subscriptions
- Play positions & history
- Playlists
- Settings (including proxy list)
- Local event log (for stats view)

### 2. Optional Sync (balados.sync)

When connected:
- Background sync via Service Worker
- Conflict resolution (last-write-wins with timestamps)
- CORS proxy provided by server
- Trending podcasts data

When disconnected:
- Full functionality maintained
- Actions queued for later sync
- User can permanently disconnect without data loss

### 3. CORS Proxy Strategy

Priority order:
1. balados.sync proxy (if connected): `/api/v1/rss/proxy/{feed}`
2. User-configured proxies (in settings)
3. Fallback public proxies (allorigins, corsproxy.io)
4. Direct fetch (may fail due to CORS)

Settings UI allows adding/removing/reordering proxies.

### 4. Internationalization (i18n)

- French (default)
- English
- Easy to add more locales

### 5. Local Analytics

Event log stored locally:
- play_started, play_completed, play_paused
- subscription_added, subscription_removed
- episode_downloaded

Stats view shows listening habits without external tracking.

## Backend Integration (balados.sync)

### Key Endpoints

| Endpoint | Purpose |
|----------|---------|
| `POST /api/v1/sync` | Full sync |
| `GET/POST /api/v1/subscriptions` | Subscriptions |
| `POST /api/v1/play` | Record play position |
| `GET /api/v1/rss/proxy/{feed}` | CORS proxy |
| `GET /api/v1/rss/user/{token}/subscriptions` | Aggregated feed |
| `GET /api/v1/public/trending/podcasts` | Trending data |

### Data Encoding

```typescript
// Feed URL to ID
const rssFeed = btoa(feedUrl)

// Episode ID
const rssItem = btoa(`${guid},${enclosureUrl}`)
```

### Authentication

JWT Bearer tokens (RS256). Connect via Settings > Sync.

## Environment Variables

```bash
VITE_DEFAULT_SYNC_URL=https://sync.balados.app  # Default sync server suggestion
VITE_DEFAULT_LOCALE=fr                           # Default language
```

## Documentation

- [docs/VISION.md](docs/VISION.md) - Project vision and goals
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) - Technical architecture
- [docs/SYNC.md](docs/SYNC.md) - Sync strategy with balados.sync
- [docs/OFFLINE.md](docs/OFFLINE.md) - Offline-first & PWA
- [docs/I18N.md](docs/I18N.md) - Internationalization
- [docs/ROADMAP.md](docs/ROADMAP.md) - Development phases
