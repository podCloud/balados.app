# Sync Feature - Implementation Status

**Last updated:** 2026-01-31
**Branch:** `feature/sync` (DO NOT MERGE until complete)
**Related Issues:** #12, #13, #14

---

## Current State

### Completed: Issue #12 - API Client

**PR:** #22 (open, needs review)
**Files:**
- `src/services/sync/client.ts` - Main sync client
- `src/services/sync/client.test.ts` - Tests (29 tests)
- `src/services/sync/index.ts` - Module exports

**What's implemented:**
- `SyncClient` class with all API methods
- JWT authentication with auto-refresh
- Retry logic with exponential backoff
- Encoding helpers (`encodeRssFeed`, `encodeRssItem`, etc.)
- Type converters between local and sync formats

### Pending: Issue #13 - Sync Settings UI

**Status:** Not started

**To implement:**
- `src/components/settings/SyncSettings.tsx` - Connection UI
- Integration with `Settings.tsx`
- OAuth flow handling (redirect to server, receive token)
- Sync status indicator in UI

### Pending: Issue #14 - Sync & Conflict Resolution

**Status:** Not started

**To implement:**
- `src/services/sync/merger.ts` - Conflict resolution logic
- Integration with `syncQueue` to process pending actions
- Service Worker background sync
- Hook `useSync()` for React components

---

## API Contract with balados.sync

### Base URL
```
https://{server}/api/v1/
```

### Authentication
- JWT Bearer token in `Authorization` header
- Tokens obtained via OAuth flow on server

### Endpoints Used by Client

| Method | Endpoint | Purpose | Implemented |
|--------|----------|---------|-------------|
| GET | `/health` | Connection test | Yes |
| POST | `/sync` | Full/incremental sync | Yes |
| GET | `/subscriptions` | List subscriptions | Yes |
| POST | `/subscriptions` | Add subscription | Yes |
| DELETE | `/subscriptions/{feed}` | Remove subscription | Yes |
| POST | `/play` | Update play position | Yes |
| GET | `/play/{feed}/{item}` | Get play position | Yes |
| GET | `/rss/proxy/{feed}` | CORS proxy | Yes |
| GET | `/public/trending/podcasts` | Trending (no auth) | Yes |

### Data Encoding

```typescript
// Feed URL encoding
const rssFeed = btoa(feedUrl)
// Example: "https://example.com/feed.xml" -> "aHR0cHM6Ly9leGFtcGxlLmNvbS9mZWVkLnhtbA=="

// Episode ID encoding
const rssItem = btoa(`${guid},${enclosureUrl}`)
// Example: "ep123,https://example.com/ep.mp3" -> "ZXAxMjMsaHR0cHM6Ly9leGFtcGxlLmNvbS9lcC5tcDM="
```

**Important:** When decoding `rssItem`, use `lastIndexOf(",")` because guid might contain commas.

---

## Data Flow

### Subscription Sync

```
balados.app                              balados.sync
-----------                              ------------
Subscription {                    -->    SubscriptionSync {
  url: string                              rss_source_feed: base64(url)
  addedAt: number (timestamp)              subscribed_at: ISO string
}                                        }
```

### Play Status Sync

```
balados.app                              balados.sync
-----------                              ------------
PlayStatus {                      -->    PlayStatusSync {
  episodeId: string                        rss_source_feed: base64(feedUrl)
  feedUrl: string                          rss_source_item: base64(guid,enclosureUrl)
  position: number                         position: number
  completed: boolean                       played: boolean
  updatedAt: number                        updated_at: ISO string
}
```

---

## Integration Points

### 1. Settings Storage

Already exists in `src/services/storage/index.ts`:
```typescript
interface AppSettings {
  locale: string;
  proxies: ProxyConfig[];
  syncServerUrl?: string;  // <-- For sync
  syncToken?: string;      // <-- For sync
}
```

### 2. Sync Queue

Already exists in `src/services/storage/syncQueue.ts`:
- `queueSubscribe()` - Queue subscription for sync
- `queueUnsubscribe()` - Queue unsubscription for sync
- `queuePlayStatus()` - Queue play position for sync
- `getPendingActions()` - Get all pending sync actions
- `getRetryableActions()` - Get actions ready to retry

### 3. Proxy Manager

In `src/services/rss/proxyManager.ts` - needs update to:
1. Check if connected to sync server
2. If yes, use server's CORS proxy first
3. Fallback to configured proxies

### 4. Hook for Sync Status

Need to create `src/hooks/useSync.ts`:
```typescript
interface UseSyncReturn {
  status: SyncStatus;
  lastSyncAt: Date | null;
  pendingCount: number;
  sync: () => Promise<void>;
  connect: (serverUrl: string) => Promise<void>;
  disconnect: () => Promise<void>;
}
```

---

## What balados.sync Needs to Implement

For the client to work, the server must have:

1. **`GET /api/v1/health`** - Simple health check
   ```json
   { "ok": true }
   ```

2. **`POST /api/v1/sync`** - Main sync endpoint
   - Accept: `{ since?, subscriptions[], play_statuses[] }`
   - Return: `{ subscriptions[], play_statuses[], synced_at }`

3. **`GET/POST/DELETE /api/v1/subscriptions`** - CRUD for subscriptions

4. **`POST /api/v1/play`** - Update play position

5. **`GET /api/v1/rss/proxy/{base64_feed}`** - CORS proxy for RSS feeds

6. **`GET /api/v1/public/trending/podcasts`** - Public trending endpoint

7. **`POST /api/v1/auth/refresh`** - Token refresh (optional but recommended)
   - Accept: `{ refresh_token }`
   - Return: `{ access_token, refresh_token?, expires_in }`

---

## Testing Together

### Local Development Setup

1. **balados.sync** running on `http://localhost:3000`
2. **balados.app** running on `http://localhost:5173`

### Test Flow

1. Start both servers
2. In balados.app Settings, enter sync server URL
3. Authenticate via server's OAuth
4. Verify sync works:
   - Add subscription in app -> appears on server
   - Play episode -> position syncs
   - Disconnect -> data preserved locally

### Environment Variables

In balados.app `.env`:
```bash
VITE_DEFAULT_SYNC_URL=http://localhost:3000
```

---

## Next Steps

1. **Review PR #22** - Sync client implementation
2. **Implement #13** - Sync Settings UI
   - Create `SyncSettings.tsx` component
   - Add to Settings page
   - Handle OAuth callback
3. **Implement #14** - Sync logic
   - Create `merger.ts` for conflict resolution
   - Integrate with syncQueue
   - Add background sync via Service Worker
4. **Update proxy manager** - Use server proxy when connected
5. **Test end-to-end** with balados.sync server

---

## Files Summary

### Existing (relevant to sync)
```
src/
├── services/
│   ├── storage/
│   │   ├── index.ts          # Settings with syncServerUrl/syncToken
│   │   └── syncQueue.ts      # Offline action queue
│   └── rss/
│       └── proxyManager.ts   # Needs sync proxy integration
├── types/
│   └── index.ts              # SyncPayload, SyncResponse types
└── components/
    └── settings/
        └── Settings.tsx      # Needs SyncSettings integration
```

### New (created for sync)
```
src/
└── services/
    └── sync/
        ├── index.ts          # Module exports
        ├── client.ts         # SyncClient class
        └── client.test.ts    # Tests
```

### To Create
```
src/
├── services/
│   └── sync/
│       ├── merger.ts         # Conflict resolution
│       └── merger.test.ts
├── hooks/
│   └── useSync.ts            # React hook for sync
└── components/
    └── settings/
        └── SyncSettings.tsx  # Sync UI
```
