# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**balados.app** is a French-language web podcast player (PWA) that works offline-first and can optionally connect to a balados.sync server for cross-device synchronization (similar to Bluesky/Mastodon federated client model).

**Core Principles:**
- **Offline-first**: Everything stored locally, sync is optional
- **Data ownership**: User can add/remove sync without losing data
- **Progressive enhancement**: Works standalone, better with sync server

---

## ⛔ RÈGLES CRITIQUES - WORKFLOW GIT ⛔

### JAMAIS DE COMMIT DIRECT SUR MAIN (sauf exceptions)

**Exceptions autorisées sur main:**
- Modifications de CLAUDE.md uniquement (pas de code)
- Modifications de config tooling (.github/, .vscode/, etc.)
- Corrections mineures de typos dans la doc (README.md, docs/*)

**POUR TOUT LE RESTE (code, tests, features), CRÉER UNE BRANCHE:**

```bash
# 1. TOUJOURS créer une branche AVANT de modifier quoi que ce soit
git checkout -b feature/issue-<number>-<slug>
# ou
git checkout -b fix/issue-<number>-<slug>

# 2. Faire les modifications et commits sur la branche

# 3. Pusher la branche
git push -u origin <branch-name>

# 4. Créer la PR avec review obligatoire
gh pr create --assignee pofmagicfingers --label "needs-claude-review" --title "..." --body "..."

# 5. ATTENDRE LA REVIEW avant de merger
```

### RÈGLES DE MERGE

- **JAMAIS de squash merge** - utiliser `gh pr merge <number> --merge --delete-branch`
- **LIRE LES REVIEWS EN ENTIER** avant de merger
- **APPLIQUER les suggestions** des reviews avant de merger (sauf si explicitement optionnelles)
- Si une review demande des changements, les faire et re-demander une review

### CHECKLIST AVANT CHAQUE TÂCHE

- [ ] Suis-je sur une branche feature/fix ? (`git branch --show-current`)
- [ ] Si non, CRÉER LA BRANCHE MAINTENANT
- [ ] Ne JAMAIS commit sur main (sauf exceptions ci-dessus)
- [ ] Ne JAMAIS push sur main (sauf exceptions ci-dessus)
- [ ] TOUJOURS passer par une PR
- [ ] TOUJOURS attendre la review Claude
- [ ] LIRE la review en entier et appliquer les suggestions

### SI J'AI OUBLIÉ ET COMMITÉ SUR MAIN

```bash
# 1. Revert immédiatement
git revert --no-commit HEAD~<n>..HEAD
git commit -m "revert: undo accidental commits to main"
git push origin main

# 2. Créer la branche et cherry-pick
git checkout -b feature/issue-<number>-<slug>
git cherry-pick <commit-hashes>

# 3. Créer la PR normalement
```

---

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

**Creating PRs with review:**
```bash
gh pr create --assignee pofmagicfingers --label "needs-claude-review" --title "..." --body "..."
```

**Always assign PRs to `pofmagicfingers`** when creating them.

The `needs-claude-review` label triggers the Claude review workflow.

**NEVER merge a PR without Claude review.**

A PR is ready to merge only when:
1. The `needs-claude-review` label was added to trigger the review
2. CI checks pass (`claude-review` shows `pass`)
3. Review comments indicate **no critical issues** remaining
4. If issues were raised, they must be fixed and a new review requested

The `claude-review` CI check passing alone is NOT sufficient - the review content must explicitly approve or show no blocking issues.

If `claude-review` shows `skipping`, the label was NOT added - add it and wait for review.

**After fixing review issues:** Re-add the `needs-claude-review` label (remove then add) to trigger a new review, then wait for the review to complete before proceeding.

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

---

## Work In Progress

### Synchronisation (Phase 4) - COMPLÈTE

La fonctionnalité sync est maintenant implémentée :
- [x] #12 Client API balados.sync (PR #22)
- [x] #23 SyncSettings UI
- [x] #24 Conflict resolution merger
- [x] #25 useSync React hook

**Documentation détaillée:** [docs/SYNC_STATUS.md](docs/SYNC_STATUS.md)

#### Fichiers implémentés

- `src/services/sync/client.ts` - Client API complet
- `src/services/sync/merger.ts` - Résolution de conflits
- `src/components/settings/SyncSettings.tsx` - UI de connexion
- `src/hooks/useSync.ts` - Hook React pour le sync

#### Encodage des données (convention partagée)

```typescript
// Feed URL -> base64
const rssFeed = btoa(feedUrl)

// Episode ID -> base64(guid,enclosureUrl)
const rssItem = btoa(`${guid},${enclosureUrl}`)
// IMPORTANT: décoder avec lastIndexOf(",") car guid peut contenir des virgules
```

**Endpoints serveur:**
- `GET /api/v1/health` - Health check
- `POST /api/v1/sync` - Sync complet/incrémental
- `GET/POST/DELETE /api/v1/subscriptions` - Abonnements
- `POST /api/v1/play` - Position de lecture
- `GET /api/v1/rss/proxy/{base64_feed}` - CORS proxy
- `GET /api/v1/public/trending/podcasts` - Tendances
