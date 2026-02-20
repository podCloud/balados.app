# Architecture technique - balados.app

## Vue d'ensemble

```
┌─────────────────────────────────────────────────────────┐
│                      balados.app                        │
│                                                         │
│  ┌───────────────────────────────────────────────────┐  │
│  │                React UI + Hooks                   │  │
│  │ ┌────────┐┌────────┐┌────────┐┌──────┐┌────────┐ │  │
│  │ │Library ││Player  ││Settings││Stats ││Explorer│ │  │
│  │ └───┬────┘└───┬────┘└───┬────┘└──┬───┘└───┬────┘ │  │
│  │     │  ┌──────────┐┌───────┐     │        │      │  │
│  │     │  │InProgress││ Debug │     │        │      │  │
│  │     │  └────┬─────┘└───┬───┘     │        │      │  │
│  └─────┼───────┼──────────┼─────────┼────────┼──────┘  │
│        │       │          │         │        │         │
│  ┌─────┴───────┴──────────┴─────────┴────────┴──────┐  │
│  │              Contexts Layer                       │  │
│  │  ┌────────────────┐ ┌──────────────────┐         │  │
│  │  │ PlayerProvider │ │ DownloadProvider │         │  │
│  │  └───────┬────────┘ └────────┬─────────┘         │  │
│  └──────────┼───────────────────┼───────────────────┘  │
│             │                   │                       │
│  ┌──────────┴───────────────────┴───────────────────┐  │
│  │               Services Layer                     │  │
│  │  ┌────────┐ ┌─────┐ ┌──────┐ ┌──────┐ ┌──────┐  │  │
│  │  │Storage │ │ RSS │ │ Sync │ │ i18n │ │Debug │  │  │
│  │  └───┬────┘ └──┬──┘ └──┬───┘ └──┬───┘ └──┬───┘  │  │
│  └──────┼─────────┼───────┼────────┼────────┼───────┘  │
│         │         │       │        │        │          │
│  ┌──────┴─────────┴───────┴────────┴────────┴───────┐  │
│  │            Service Worker (PWA)                   │  │
│  │  • Cache management  • Background sync            │  │
│  │  • Offline queue     • Push notifications         │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
           │                   │
           ▼                   ▼
    ┌──────────────┐    ┌──────────────┐
    │  IndexedDB   │    │ balados.sync │
    │ (local data) │    │  (optional)  │
    └──────────────┘    └──────────────┘
```

## Couches applicatives

### 1. UI Layer (React)

Composants React avec TanStack Query pour le data fetching.

```
components/
├── debug/            # Outils de debug
│   └── Debug.tsx
├── explorer/         # Découverte & tendances
│   ├── Explorer.tsx
│   └── Trending.tsx
├── inProgress/       # Épisodes en cours d'écoute
│   └── InProgress.tsx
├── library/          # Gestion des abonnements
│   ├── Library.tsx
│   ├── SubscriptionItem.tsx
│   └── SyncStatusIcon.tsx
├── player/           # Lecteur audio
│   ├── EpisodePlayer.tsx
│   ├── MiniPlayer.tsx
│   └── PlayerControls.tsx
├── podcast/          # Détails podcast
│   ├── PodcastDetail.tsx
│   └── EpisodeList.tsx
├── settings/         # Configuration
│   ├── Settings.tsx
│   ├── StorageSettings.tsx
│   └── SyncSettings.tsx
├── stats/            # Statistiques locales
│   └── Stats.tsx
└── ui/               # Composants partagés
    ├── DownloadButton.tsx
    ├── ErrorBoundary.tsx
    ├── LikeButton.tsx
    ├── OfflineBanner.tsx
    └── TabBar.tsx
```

### 2. Contexts Layer

React Contexts fournissant l'état global (player, téléchargements) aux composants. Abstraction de haut niveau au-dessus des services.

```typescript
// contexts/playerContext.ts - Context definition for audio player
// contexts/PlayerProvider.tsx - Global audio player state & controls
// contexts/usePlayer.ts - Hook to consume player context

// contexts/downloadContext.ts - Context definition for downloads
// contexts/DownloadProvider.tsx - Global download state & queue management
// contexts/useDownload.ts - Hook to consume download context

// contexts/index.ts - Context exports
```

### 3. Services Layer

Logique métier indépendante de l'UI.

#### RSS Service

```typescript
// services/rss/parser.ts - RSS feed parsing (HTML → markdown via Turndown)
// services/rss/proxyManager.ts - Multi-proxy with fallback chain:
//   1. Direct fetch (no proxy)
//   2. balados.sync proxy (if connected)
//   3. User-configured public proxies
```

#### Sync Service

```typescript
// services/sync/client.ts - API client for balados.sync server
// services/sync/merger.ts - Conflict resolution (last-write-wins)
// services/sync/queueProcessor.ts - Process offline action queue
// services/sync/backgroundSync.ts - Service Worker background sync
// services/sync/index.ts - Service exports
```

#### i18n Service

```typescript
// services/i18n/index.ts - i18next configuration and language detection
// services/i18n/locales/ - Translation files (fr.json, en.json)
```

#### Debug Service

```typescript
// services/debug/index.ts - Debug utilities and logging
```

#### Storage Service

```typescript
// services/storage/index.ts - Dexie.js database schema (incl. likes table)
// services/storage/subscriptions.ts - Subscription CRUD
// services/storage/playStatus.ts - Play position tracking
// services/storage/events.ts - Local event logging for stats
// services/storage/syncQueue.ts - Offline sync action queue (incl. likePodcast/unlikePodcast)
// services/storage/downloads.ts - Episode download persistence
// services/storage/hiddenEpisodes.ts - Hidden episodes tracking
```

### 4. Hooks Layer

Hooks React qui connectent l'UI aux services.

```typescript
// hooks/useLike.ts - Like state & optimistic updates (likeDelta)
// hooks/useSync.ts - React hook for sync state management (incl. applyLikeChanges)
// hooks/useSyncQueue.ts - Sync queue operations
// hooks/useTrending.ts - Trending podcasts data
// hooks/useOnline.ts - Network status detection
```

### 5. Service Worker Layer

PWA functionality avec Workbox.

```typescript
// workers/sw.ts
// Cache strategies
// - Network-first pour RSS feeds
// - Cache-first pour assets statiques
// - Stale-while-revalidate pour images de podcasts

// Background sync
// - Queue des actions offline
// - Sync automatique quand online

// Push notifications
// - Nouveaux épisodes (si serveur connecté)
```

## Stockage des données

### IndexedDB (via Dexie.js)

```typescript
// Database schema
interface BaladosDB {
  subscriptions: {
    feedUrl: string      // Primary key
    title: string
    author: string
    imageUrl: string
    addedAt: Date
    lastFetchedAt: Date
    // ... metadata
  }

  episodes: {
    id: string           // guid,enclosure
    feedUrl: string      // Index
    title: string
    publishedAt: Date
    duration: number
    enclosureUrl: string
    // ... metadata
  }

  playStatus: {
    episodeId: string    // Primary key
    position: number
    completed: boolean
    updatedAt: Date
  }

  likes: {
    feedUrl: string      // Primary key
    likedAt: number      // Timestamp
  }

  events: {
    id: string           // Auto-generated
    type: string         // Index
    payload: object
    timestamp: Date
  }

  syncQueue: {
    id: string
    action: string
    payload: object
    createdAt: Date
    attempts: number
  }

  settings: {
    key: string          // Primary key
    value: any
  }
}
```

### localStorage (fallback & small data)

```typescript
// Données légères uniquement
{
  "balados:currentEpisode": "episodeId",
  "balados:playerState": { volume, playbackRate },
  "balados:locale": "fr",
  "balados:theme": "dark"
}
```

## Flow de données

### Lecture d'un épisode

```
User clicks play
       │
       ▼
┌──────────────┐
│ EpisodePlayer│
└──────┬───────┘
       │ useQuery('playStatus', episodeId)
       ▼
┌──────────────┐
│StorageService│◄─── IndexedDB
└──────┬───────┘
       │ position, completed
       ▼
┌──────────────┐
│ Audio Element│
└──────┬───────┘
       │ timeupdate event
       ▼
┌──────────────┐
│StorageService│───► IndexedDB (save position)
└──────┬───────┘
       │ if (syncEnabled)
       ▼
┌──────────────┐
│ SyncService  │───► syncQueue (if offline)
└──────┬───────┘     or
       │             balados.sync API (if online)
       ▼
┌──────────────┐
│EventsService │───► IndexedDB (log play_progress)
└──────────────┘
```

### Fetch d'un flux RSS

```
Request feed
       │
       ▼
┌──────────────┐
│ ProxyManager │
└──────┬───────┘
       │
       ▼
┌─────────────────────────────────────┐
│ Try in order:                       │
│ 1. Direct fetch (no proxy)          │
│ 2. balados.sync proxy (if connected)│
│ 3. User-configured public proxies   │
└──────┬──────────────────────────────┘
       │ First successful response
       ▼
┌──────────────┐
│  RSS Parser  │
└──────┬───────┘
       │ Parsed PodcastFeed
       ▼
┌──────────────┐
│StorageService│───► IndexedDB (cache episodes)
└──────────────┘
```

## Technologies

| Catégorie | Technologie | Justification |
|-----------|-------------|---------------|
| Framework | React 19 | Écosystème mature, hooks |
| Build | Vite 7 | Rapide, HMR natif |
| State | TanStack Query | Cache, sync, offline |
| Storage | Dexie.js | Wrapper IndexedDB ergonomique |
| PWA | Workbox | Service Worker simplifié |
| i18n | react-i18next | Standard React |
| CSS | Tailwind CSS | Utility-first, rapide |
| Icons | Lucide React | Lightweight, tree-shakeable |
| Markdown | Turndown + marked | RSS HTML→MD→render pipeline |
| Sanitization | DOMPurify | XSS prevention for rendered content |
| Tests | Vitest | Compatible Vite |

## Sécurité

### Stockage

- Pas de données sensibles en clair
- Tokens JWT stockés en mémoire ou IndexedDB (pas localStorage)
- Option "effacer toutes les données"

### Réseau

- HTTPS obligatoire pour le sync
- Validation des réponses RSS
- CSP headers stricts

### CORS

- Proxies de confiance configurables
- Pas d'exécution de scripts depuis les feeds
- Sanitization du HTML (descriptions)
