# Architecture technique - balados.app

## Vue d'ensemble

```
┌─────────────────────────────────────────────────────────────┐
│                        balados.app                          │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                    React UI                          │   │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐   │   │
│  │  │ Library │ │ Player  │ │Settings │ │  Stats  │   │   │
│  │  └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘   │   │
│  └───────┼───────────┼───────────┼───────────┼─────────┘   │
│          │           │           │           │              │
│  ┌───────┴───────────┴───────────┴───────────┴─────────┐   │
│  │                  Services Layer                      │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐            │   │
│  │  │ Storage  │ │   RSS    │ │   Sync   │            │   │
│  │  └────┬─────┘ └────┬─────┘ └────┬─────┘            │   │
│  └───────┼────────────┼────────────┼───────────────────┘   │
│          │            │            │                        │
│  ┌───────┴────────────┴────────────┴───────────────────┐   │
│  │              Service Worker (PWA)                    │   │
│  │  • Cache management  • Background sync               │   │
│  │  • Offline queue     • Push notifications            │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
           │                    │
           ▼                    ▼
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
├── library/          # Gestion des abonnements
│   ├── Library.tsx
│   ├── SubscriptionItem.tsx
│   └── AddPodcast.tsx
├── player/           # Lecteur audio
│   ├── EpisodePlayer.tsx
│   ├── PlayerControls.tsx
│   ├── ProgressBar.tsx
│   └── Queue.tsx
├── podcast/          # Détails podcast
│   ├── PodcastDetail.tsx
│   ├── EpisodeList.tsx
│   └── EpisodeItem.tsx
├── settings/         # Configuration
│   ├── Settings.tsx
│   ├── SyncSettings.tsx
│   ├── ProxySettings.tsx
│   └── LanguageSettings.tsx
├── stats/            # Statistiques locales
│   └── LocalStats.tsx
├── trending/         # Tendances (avec serveur)
│   └── TrendingPodcasts.tsx
└── ui/               # Composants partagés
    ├── Button.tsx
    ├── Modal.tsx
    └── Toast.tsx
```

### 2. Services Layer

Logique métier indépendante de l'UI.

#### Storage Service

```typescript
// services/storage/index.ts
interface StorageService {
  // Subscriptions
  getSubscriptions(): Promise<Subscription[]>
  addSubscription(sub: Subscription): Promise<void>
  removeSubscription(feedUrl: string): Promise<void>

  // Play status
  getPlayStatus(episodeId: string): Promise<PlayStatus | null>
  updatePlayStatus(status: PlayStatus): Promise<void>

  // Events (for local stats)
  logEvent(event: LocalEvent): Promise<void>
  getEvents(filter: EventFilter): Promise<LocalEvent[]>

  // Settings
  getSettings(): Promise<Settings>
  updateSettings(settings: Partial<Settings>): Promise<void>
}
```

#### RSS Service

```typescript
// services/rss/index.ts
interface RSSService {
  fetchFeed(feedUrl: string): Promise<PodcastFeed>
  searchPodcasts(query: string): Promise<SearchResult[]>
}

// services/rss/proxyManager.ts
interface ProxyManager {
  fetch(url: string): Promise<Response>
  addProxy(proxy: ProxyConfig): void
  removeProxy(proxyId: string): void
  reorderProxies(order: string[]): void
}
```

#### Sync Service

```typescript
// services/sync/index.ts
interface SyncService {
  connect(serverUrl: string, token: string): Promise<void>
  disconnect(): Promise<void>
  isConnected(): boolean

  sync(): Promise<SyncResult>
  getStatus(): SyncStatus

  // Conflict resolution
  resolveConflict(conflict: Conflict, resolution: Resolution): Promise<void>
}
```

### 3. Service Worker Layer

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
│ Try proxies in order:               │
│ 1. balados.sync proxy (if connected)│
│ 2. User-configured proxies          │
│ 3. Public proxies (allorigins...)   │
│ 4. Direct fetch                     │
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
