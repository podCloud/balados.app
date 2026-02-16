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

Le SW utilise la stratégie **injectManifest** de vite-plugin-pwa, ce qui permet un SW personnalisé avec support du Background Sync API.

```typescript
// src/workers/sw.ts
import { precacheAndRoute } from "workbox-precaching";
import { registerRoute } from "workbox-routing";
import { NetworkFirst, CacheFirst } from "workbox-strategies";
import { processQueue, notifySyncComplete } from "../services/sync/queueProcessor";

// Precache app shell
precacheAndRoute(self.__WB_MANIFEST);

// Runtime caching strategies
registerRoute(/^https:\/\/(api\.allorigins\.win|corsproxy\.io)/, new NetworkFirst({ ... }));
registerRoute(/\.(png|jpg|jpeg|webp|gif)$/, new CacheFirst({ ... }));
registerRoute(/\.(mp3|m4a|ogg|wav|aac)$/, new CacheFirst({ ... }));

// Background Sync - processes queue when connectivity returns
self.addEventListener("sync", (event) => {
  if (event.tag === "balados-sync-queue") {
    event.waitUntil(processQueue("sw").then(notifySyncComplete));
  }
});

// Periodic Sync - processes queue every 15 min
self.addEventListener("periodicsync", (event) => {
  if (event.tag === "balados-periodic-sync") {
    event.waitUntil(processQueue("sw").then(notifySyncComplete));
  }
});
```

**Détails complets** : [BACKGROUND_SYNC.md](BACKGROUND_SYNC.md)

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

La queue est traitée par 3 mécanismes complémentaires :

1. **Background Sync API** (SW) - Quand le réseau revient, même si l'app est fermée (Chrome/Edge)
2. **Event `online`** (app) - Quand l'app est ouverte et le réseau revient (tous navigateurs)
3. **Periodic Sync** (SW) - Toutes les 15 min (Chrome avec engagement suffisant)

La coordination entre le SW et l'app utilise un **verrou IndexedDB** pour éviter le traitement concurrent.

```typescript
// services/sync/queueProcessor.ts (partagé entre SW et app)
export async function processQueue(holder: "sw" | "app"): Promise<number> {
  const locked = await acquireSyncLock(holder);
  if (!locked) return -1; // Autre processus en cours

  try {
    const actions = await getRetryableActions();
    for (const action of actions) {
      const success = await processAction(action, settings);
      if (success) await removeAction(action.id);
    }
  } finally {
    await releaseSyncLock();
  }
}
```

**Détails complets** : [BACKGROUND_SYNC.md](BACKGROUND_SYNC.md)

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
