# Offline-First & PWA

## Philosophie

balados.app est conçu pour fonctionner parfaitement sans connexion internet. La connexion est un bonus, pas une nécessité.

## Progressive Web App (PWA)

### Manifest

```json
// public/manifest.json
{
  "name": "balados.app",
  "short_name": "Balados",
  "description": "Lecteur de podcasts web",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#1a1a2e",
  "theme_color": "#6366f1",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icon-maskable.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

### Service Worker

```typescript
// workers/sw.ts (avec Workbox)
import { precacheAndRoute } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { NetworkFirst, CacheFirst, StaleWhileRevalidate } from 'workbox-strategies'
import { BackgroundSyncPlugin } from 'workbox-background-sync'

// Precache des assets buildés
precacheAndRoute(self.__WB_MANIFEST)

// Stratégies de cache
registerRoute(
  /\/api\/.*\/rss/,
  new NetworkFirst({ cacheName: 'rss-feeds', networkTimeoutSeconds: 10 })
)

registerRoute(
  /\.(png|jpg|jpeg|webp|svg)$/,
  new CacheFirst({ cacheName: 'images' })
)

registerRoute(
  /\.(mp3|m4a|ogg|wav)$/,
  new CacheFirst({ cacheName: 'audio' })
)
```

## Stockage local

### IndexedDB (données structurées)

| Table | Taille estimée | Durée de vie |
|-------|----------------|--------------|
| subscriptions | ~1KB/podcast | Permanent |
| episodes | ~2KB/épisode | Cache 30 jours |
| playStatus | ~100B/épisode | Permanent |
| events | ~200B/event | 90 jours |
| syncQueue | Variable | Jusqu'au sync |
| settings | ~1KB | Permanent |

### Cache API (fichiers)

| Type | Stratégie | Taille max |
|------|-----------|------------|
| App shell | Precache | ~500KB |
| Images podcasts | Cache-first | 50MB |
| Audio téléchargé | Cache-first | Configurable |
| Flux RSS | Network-first | 10MB |

### Gestion de l'espace

```typescript
// Estimation de l'espace utilisé
async function getStorageEstimate() {
  if (navigator.storage && navigator.storage.estimate) {
    const estimate = await navigator.storage.estimate()
    return {
      usage: estimate.usage,      // Bytes utilisés
      quota: estimate.quota,       // Quota total
      percent: (estimate.usage / estimate.quota) * 100
    }
  }
}

// Nettoyage si espace insuffisant
async function cleanup() {
  // 1. Supprimer les épisodes en cache > 30 jours non écoutés
  // 2. Supprimer les events > 90 jours
  // 3. Réduire la taille du cache images
}
```

## Fonctionnalités offline

### Lecture

| Fonctionnalité | Offline | Notes |
|----------------|---------|-------|
| Lecture épisode téléchargé | ✅ | |
| Lecture épisode non téléchargé | ❌ | Streaming nécessite réseau |
| Contrôles (play, pause, seek) | ✅ | |
| Changement de vitesse | ✅ | |
| Position sauvegardée | ✅ | Sync quand online |

### Navigation

| Fonctionnalité | Offline | Notes |
|----------------|---------|-------|
| Liste des abonnements | ✅ | Données en cache |
| Détails podcast | ✅ | Si déjà visité |
| Liste des épisodes | ✅ | Cache 30 jours |
| Recherche de podcasts | ❌ | Nécessite API |
| Tendances | ❌ | Nécessite serveur |

### Actions

| Action | Offline | Comportement |
|--------|---------|--------------|
| S'abonner | ✅ | Queue pour sync |
| Se désabonner | ✅ | Queue pour sync |
| Marquer comme lu | ✅ | Queue pour sync |
| Télécharger épisode | ❌ | Nécessite réseau |
| Modifier paramètres | ✅ | Local immédiat |

## Queue offline

### Structure

```typescript
interface QueuedAction {
  id: string
  action: 'subscribe' | 'unsubscribe' | 'updatePlayStatus' | 'sync'
  payload: object
  createdAt: Date
  attempts: number
  lastError?: string
}
```

### Traitement

```typescript
// Service Worker
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-actions') {
    event.waitUntil(processQueue())
  }
})

async function processQueue() {
  const queue = await db.syncQueue.toArray()

  for (const action of queue) {
    try {
      await executeAction(action)
      await db.syncQueue.delete(action.id)
    } catch (error) {
      action.attempts++
      action.lastError = error.message
      await db.syncQueue.put(action)

      if (action.attempts >= 5) {
        // Notifier l'utilisateur
        await notifyUser('Erreur de synchronisation', action)
      }
    }
  }
}
```

## Téléchargement d'épisodes

### Téléchargement manuel

```typescript
async function downloadEpisode(episode: Episode) {
  const response = await fetch(episode.enclosureUrl)
  const blob = await response.blob()

  // Stocker dans Cache API
  const cache = await caches.open('audio')
  await cache.put(episode.enclosureUrl, new Response(blob))

  // Marquer comme téléchargé
  await db.episodes.update(episode.id, { downloaded: true })
}
```

### Téléchargement automatique

Settings:
- ☐ Télécharger automatiquement les nouveaux épisodes
- ☐ Uniquement sur WiFi
- Limite de stockage: [500 MB ▼]

```typescript
// Service Worker - Periodic Sync (si supporté)
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'download-new-episodes') {
    event.waitUntil(downloadNewEpisodes())
  }
})
```

## Indicateurs UI

### Statut réseau

```
🟢 En ligne
🟡 Connexion instable
🔴 Hors ligne
```

### Épisode

```
⬇️ Télécharger
✅ Téléchargé (disponible hors-ligne)
⏳ Téléchargement en cours (45%)
⚠️ Téléchargement échoué
```

### Sync

```
✓ Synchronisé
↻ En attente de sync (3 actions)
⚠️ Erreur de sync
```

## Notifications

### Types (si permissions accordées)

| Notification | Quand | Condition |
|--------------|-------|-----------|
| Nouveaux épisodes | Background sync | Auto-check activé |
| Téléchargement terminé | Après download | Téléchargement manuel |
| Erreur de sync | Après échecs répétés | Serveur connecté |

### Implémentation

```typescript
// Service Worker
async function showNotification(title: string, options: NotificationOptions) {
  const permission = await Notification.requestPermission()
  if (permission === 'granted') {
    await self.registration.showNotification(title, {
      badge: '/icon-badge.png',
      icon: '/icon-192.png',
      ...options
    })
  }
}
```

## Tests offline

### Checklist

- [ ] L'app se charge sans réseau (après première visite)
- [ ] La navigation fonctionne entre les pages cached
- [ ] La lecture fonctionne pour les épisodes téléchargés
- [ ] Les actions sont mises en queue
- [ ] La queue est traitée au retour online
- [ ] Les indicateurs UI reflètent l'état
- [ ] Les erreurs sont gérées gracieusement

### Simulation

```javascript
// DevTools > Network > Offline
// ou
navigator.serviceWorker.controller.postMessage({ type: 'SIMULATE_OFFLINE' })
```
