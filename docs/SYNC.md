# Synchronisation avec balados.sync

## Vue d'ensemble

balados.app peut fonctionner de deux manières:

1. **Mode standalone**: Tout en local, pas de serveur
2. **Mode connecté**: Synchronisation avec un serveur balados.sync

La transition entre les deux modes est transparente et ne perd jamais de données.

## Architecture de synchronisation

```
┌─────────────────────────────────────────────────────────┐
│                     balados.app                          │
│                                                          │
│  ┌────────────────┐        ┌────────────────┐           │
│  │  Local Storage │◄──────►│  Sync Service  │           │
│  │   (IndexedDB)  │        └───────┬────────┘           │
│  └────────────────┘                │                    │
│         ▲                          │                    │
│         │                          │                    │
│  ┌──────┴─────────┐        ┌───────┴────────┐          │
│  │ Service Worker │◄──────►│  Sync Queue    │          │
│  └────────────────┘        └───────┬────────┘          │
│                                    │                    │
└────────────────────────────────────┼────────────────────┘
                                     │
                                     ▼
                          ┌────────────────────┐
                          │   balados.sync     │
                          │   (optionnel)      │
                          └────────────────────┘
```

## Connexion au serveur

### Configuration

```typescript
interface SyncConfig {
  serverUrl: string        // ex: "https://sync.balados.app"
  token: string           // JWT token
  autoSync: boolean       // Sync automatique en arrière-plan
  syncInterval: number    // Intervalle en minutes (défaut: 15)
}
```

### Flow de connexion

```
1. User entre l'URL du serveur
2. Redirection vers la page d'auth du serveur
3. Serveur génère un JWT
4. Retour vers balados.app avec le token
5. Test de connexion (GET /api/v1/sync)
6. Stockage du token (IndexedDB)
7. Sync initial
```

### Déconnexion

```
1. User clique "Déconnecter"
2. Suppression du token
3. Conservation de toutes les données locales
4. Passage en mode standalone
```

## Données synchronisées

### Abonnements

```typescript
interface SubscriptionSync {
  rss_source_feed: string   // base64(feedUrl)
  rss_source_id: string     // Identifiant podcast
  subscribed_at: string     // ISO date
  unsubscribed_at?: string  // ISO date (si désabonné)
}
```

### Positions de lecture

```typescript
interface PlayStatusSync {
  rss_source_feed: string   // base64(feedUrl)
  rss_source_item: string   // base64(guid,enclosureUrl)
  position: number          // Secondes
  played: boolean           // Épisode terminé
  updated_at: string        // ISO date
}
```

### Playlists

```typescript
interface PlaylistSync {
  id: string
  name: string
  items: PlaylistItem[]
  created_at: string
  updated_at: string
}
```

## Stratégie de synchronisation

### Sync complet

Au premier sync ou sur demande manuelle:

```
POST /api/v1/sync
{
  subscriptions: [...],
  play_statuses: [...],
  playlists: [...]
}

Response:
{
  subscriptions: [...],    // Merged result
  play_statuses: [...],
  playlists: [...]
}
```

### Sync incrémental

En arrière-plan via Service Worker:

```
POST /api/v1/sync
{
  since: "2024-01-15T10:00:00Z",  // Dernier sync
  subscriptions: [changed...],
  play_statuses: [changed...],
  playlists: [changed...]
}
```

### Sync offline

Quand l'appareil est hors-ligne:

1. Actions stockées dans `syncQueue`
2. Service Worker détecte le retour online
3. Queue traitée automatiquement
4. Conflits résolus (voir ci-dessous)

## Résolution de conflits

### Stratégie: Last-Write-Wins avec timestamp

```typescript
function resolveConflict(local: Data, remote: Data): Data {
  // Le plus récent gagne
  return local.updatedAt > remote.updatedAt ? local : remote
}
```

### Cas particuliers

| Conflit | Résolution |
|---------|------------|
| Même épisode, positions différentes | Position la plus avancée |
| Abonnement local + désabo remote | Timestamp le plus récent |
| Playlist modifiée des deux côtés | Merge des items + timestamp |

### Notifications de conflit

L'utilisateur est notifié uniquement pour les conflits importants:
- Playlist supprimée sur un appareil, modifiée sur l'autre
- Abonnement supprimé vs nouvel épisode écouté

## CORS Proxy via balados.sync

Quand connecté, utiliser le proxy du serveur:

```typescript
// Sans serveur
const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(feedUrl)}`

// Avec serveur
const proxyUrl = `${serverUrl}/api/v1/rss/proxy/${btoa(feedUrl)}`
```

### Avantages du proxy serveur

- Cache LRU côté serveur (5 min)
- Pas de limite de rate
- Fiabilité garantie
- Headers CORS corrects

## UI de synchronisation

### Settings > Synchronisation

```
┌─────────────────────────────────────────┐
│ Synchronisation                         │
├─────────────────────────────────────────┤
│                                         │
│ Statut: ● Connecté                      │
│ Serveur: sync.balados.app               │
│ Dernier sync: Il y a 5 minutes          │
│                                         │
│ [Synchroniser maintenant]               │
│                                         │
│ ☑ Sync automatique                      │
│ Intervalle: [15 minutes ▼]              │
│                                         │
│ [Déconnecter]                           │
│                                         │
│ ─────────────────────────────           │
│                                         │
│ [Se connecter à un autre serveur]       │
│                                         │
└─────────────────────────────────────────┘
```

### Indicateur de sync

Dans la barre de navigation:

```
○ Pas de serveur
● Connecté, à jour
◐ Synchronisation en cours
◑ Actions en attente (offline)
● Erreur de sync (clic pour détails)
```

## Scénarios

### Nouvel utilisateur

1. Utilise l'app sans compte
2. Décide de synchroniser après quelques semaines
3. Connecte un serveur
4. Toutes ses données locales sont uploadées
5. Continue avec sync activé

### Changement de serveur

1. Déconnecte l'ancien serveur
2. Données locales conservées
3. Connecte le nouveau serveur
4. Sync initial fusionne les données

### Suppression du compte serveur

1. Déconnecte le serveur
2. Toutes les données restent en local
3. Continue en mode standalone

### Multi-appareils

1. Téléphone et ordinateur connectés au même serveur
2. Écoute un épisode sur téléphone
3. Position synchronisée
4. Reprend sur ordinateur à la même position
