# Background Sync

Background sync enables the app to process queued sync actions (subscriptions, play positions) even when the user closes the browser tab. This is the final piece of the offline-first sync puzzle.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  Main Thread (React App)                                        │
│                                                                 │
│  User Action → syncQueue.queueSubscribe()                       │
│       │              │                                          │
│       │              ├─→ IndexedDB (syncQueue table)            │
│       │              └─→ requestBackgroundSync()                │
│       │                        │                                │
│       │                        ▼                                │
│       │              navigator.serviceWorker.ready              │
│       │              registration.sync.register("balados-sync") │
│       │                                                         │
│       ▼                                                         │
│  useSyncQueue hook                                              │
│       │                                                         │
│       ├─→ window "online" event → processQueue("app")           │
│       └─→ BroadcastChannel("balados-sync") ← listens for       │
│                                     "sync-complete" messages    │
└─────────────────────────────────────────────────────────────────┘
                              │
                    ┌─────────┴──────────┐
                    │  Service Worker     │
                    │                     │
                    │  "sync" event       │──→ processQueue("sw")
                    │  "periodicsync"     │──→ processQueue("sw")
                    │  "message"          │──→ processQueue("sw")
                    │                     │
                    │  On complete:       │
                    │  BroadcastChannel   │──→ notifySyncComplete()
                    │  "balados-sync"     │
                    └─────────────────────┘
                              │
                    ┌─────────┴──────────┐
                    │  IndexedDB Lock     │
                    │  (sync_lock key)    │
                    │                     │
                    │  Prevents both SW   │
                    │  and app from       │
                    │  processing queue   │
                    │  simultaneously     │
                    └─────────────────────┘
```

## How It Works

### 1. Queuing Actions

When the user subscribes, unsubscribes, or updates a play position, the action is stored in IndexedDB and a background sync event is registered:

```typescript
// In syncQueue.ts
export const queueSubscribe = async (payload) => {
  const id = await db.syncQueue.add({ action: "subscribe", payload, ... });
  await requestBackgroundSync(); // Register SW sync event
  return id;
};
```

### 2. Processing (Three Paths)

Actions are processed through three independent mechanisms:

| Path | Trigger | When | Browser Support |
|------|---------|------|-----------------|
| **Background Sync** | `sync` event in SW | Browser regains connectivity (even if app is closed) | Chrome, Edge |
| **Online listener** | `window.online` event | App is open and comes back online | All browsers |
| **Periodic Sync** | `periodicsync` event | Every 15 min (browser-controlled) | Chrome (with site engagement) |

### 3. Coordination via IndexedDB Lock

Both the SW and the React hook use the same `processQueue()` function from `queueProcessor.ts`. A lock in IndexedDB prevents concurrent processing:

```typescript
async function processQueue(holder: "sw" | "app") {
  const locked = await acquireSyncLock(holder);
  if (!locked) return -1; // Another process is working

  try {
    // Process actions...
  } finally {
    await releaseSyncLock();
  }
}
```

The lock has a 60-second TTL as a safety net against stale locks (e.g., if the SW crashes mid-processing).

### 4. SW → App Communication

When the SW finishes processing, it sends a message via `BroadcastChannel("balados-sync")` so the React hook can refresh its pending count without a full page reload.

## File Structure

```
src/
├── workers/
│   └── sw.ts                          # Custom Service Worker
├── services/
│   ├── sync/
│   │   ├── backgroundSync.ts          # SW registration helpers
│   │   ├── backgroundSync.test.ts     # Tests
│   │   ├── queueProcessor.ts          # Shared processing logic (SW + app)
│   │   └── queueProcessor.test.ts     # Tests
│   └── storage/
│       └── syncQueue.ts               # Queue operations (calls requestBackgroundSync)
├── hooks/
│   ├── useSync.ts                     # Full sync hook (registers periodic sync)
│   └── useSyncQueue.ts                # Queue hook (listens for BroadcastChannel)
└── types/
    └── background-sync.d.ts           # TypeScript declarations for Sync APIs
```

## Service Worker Details

The SW (`src/workers/sw.ts`) is built using the **injectManifest** strategy from `vite-plugin-pwa`. This means:

- Workbox precaching is handled via `precacheAndRoute(self.__WB_MANIFEST)`
- Runtime caching routes are defined manually (same strategies as before)
- Custom event handlers are added for `sync`, `periodicsync`, and `message`

### Runtime Caching Strategies

| Resource | Strategy | Cache Name | TTL |
|----------|----------|------------|-----|
| RSS feeds (CORS proxies) | NetworkFirst | `rss-feeds` | 1 hour |
| Podcast images | CacheFirst | `podcast-images` | 30 days |
| Audio files | CacheFirst + Range | `podcast-audio` | 7 days |

## Browser Support

### Background Sync API

| Browser | Supported | Fallback |
|---------|-----------|----------|
| Chrome/Chromium | Yes | - |
| Edge | Yes | - |
| Firefox | No | `online` event listener |
| Safari | No | `online` event listener |

### Periodic Background Sync

More restrictive than one-shot sync:

| Browser | Supported | Requirements |
|---------|-----------|-------------|
| Chrome/Chromium | Yes | Site engagement score, permission granted |
| Others | No | App-level sync on open |

### Graceful Degradation

All sync registration functions check for API availability before calling:

```typescript
export function isBackgroundSyncSupported(): boolean {
  return "serviceWorker" in navigator && "SyncManager" in window;
}
```

If APIs are not available, functions are no-ops. The existing `useSyncQueue` online event listener serves as the universal fallback.

## Configuration

### Periodic Sync Interval

The minimum interval is set to 15 minutes. The browser may adjust this based on:
- Site engagement score (how often the user visits)
- Battery level
- Network conditions

```typescript
// In backgroundSync.ts
const PERIODIC_SYNC_INTERVAL = 15 * 60 * 1000; // 15 minutes
```

### Lock TTL

The processing lock expires after 60 seconds as a safety net:

```typescript
// In queueProcessor.ts
const LOCK_TTL_MS = 60_000; // 1 minute
```

## Debugging

### Chrome DevTools

1. **Application > Service Workers**: Check SW status, trigger sync manually
2. **Application > Background Sync**: View registered sync tags
3. **Application > Periodic Background Sync**: View periodic sync registrations
4. **Application > IndexedDB > balados > settings**: Check `sync_lock` entry

### Manual Sync Trigger

From the browser console:

```javascript
// Trigger background sync manually
const reg = await navigator.serviceWorker.ready;
await reg.sync.register("balados-sync-queue");

// Or send message to SW
reg.active.postMessage({ type: "PROCESS_SYNC_QUEUE" });
```

### Checking Lock State

```javascript
// Check if lock exists
const db = await indexedDB.open("balados");
const tx = db.transaction("settings", "readonly");
const store = tx.objectStore("settings");
const lock = await store.get("sync_lock");
console.log("Lock:", lock);
```

## Testing

Tests cover:
- Lock acquisition/release/expiry (`queueProcessor.test.ts`)
- API endpoint routing for each action type
- Action processing with success/failure
- Queue processing with lock coordination
- BroadcastChannel notification
- Graceful degradation when APIs not supported (`backgroundSync.test.ts`)
- SW sync registration and error handling
