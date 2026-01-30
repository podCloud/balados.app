# Roadmap de développement

## Vue d'ensemble des phases

```
Phase 1: Fondations          ████████████████████  100% ✓
Phase 2: PWA & Offline       ████████████████████  100% ✓
Phase 3: Internationalisation████████████████████  100% ✓
Phase 4: Synchronisation     ░░░░░░░░░░░░░░░░░░░░
Phase 5: Tendances           ░░░░░░░░░░░░░░░░░░░░
```

---

## Phase 1: Fondations

**Objectif**: Transformer le prototype en application structurée et fonctionnelle.

### 1.1 Setup du projet

- [x] Configurer Vitest + Testing Library
- [x] Installer et configurer TanStack Query
- [x] Installer Dexie.js pour IndexedDB
- [x] Configurer react-i18next (structure de base)
- [x] Setup ESLint avec règles strictes

### 1.2 Refactoring de App.tsx

- [x] Extraire les types dans `types/index.ts`
- [x] Créer le service de stockage (`services/storage/`)
- [x] Créer le service RSS (`services/rss/`)
- [x] Extraire les composants:
  - [x] `components/library/Library.tsx`
  - [x] `components/library/SubscriptionItem.tsx`
  - [x] `components/podcast/PodcastDetail.tsx`
  - [x] `components/podcast/EpisodeList.tsx`
  - [x] `components/player/EpisodePlayer.tsx`
  - [x] `components/player/PlayerControls.tsx`
  - [x] `components/player/MiniPlayer.tsx`
  - [x] `components/explorer/Explorer.tsx` (iframe vers sync.balados.app)
- [x] Créer PlayerContext pour la gestion globale du lecteur
- [x] Migrer vers TanStack Query

### 1.3 Gestion des proxies

- [x] Créer `ProxyManager` avec fallback
- [x] Gestion des erreurs et retry
- [ ] UI Settings pour gérer les proxies (déplacé vers Phase 3)

### 1.4 Stockage local persistant

- [x] Migration localStorage -> IndexedDB
- [x] Schema Dexie pour toutes les entités
- [x] Sauvegarde/restauration des positions de lecture
- [ ] Tests de persistence (déplacé vers Phase 2)

### 1.5 Tests

- [ ] Tests unitaires services
- [ ] Tests composants critiques
- [ ] Tests d'intégration flux principaux

---

## Phase 2: PWA & Offline

**Objectif**: Application installable fonctionnant hors-ligne.

### 2.1 Setup PWA

- [x] Créer `manifest.json` (via vite-plugin-pwa)
- [x] Générer les icônes (192, 512, maskable)
- [x] Configurer Vite PWA plugin
- [x] Meta tags pour mobile (iOS, theme-color, etc.)

### 2.2 Service Worker

- [x] Setup Workbox (via vite-plugin-pwa)
- [x] Stratégies de cache:
  - [x] App shell (precache)
  - [x] Flux RSS (network-first, 1h cache)
  - [x] Images (cache-first, 30 jours)
  - [x] Audio (cache-first, 7 jours, range requests)
- [x] Background sync pour actions offline

### 2.3 Téléchargement d'épisodes

- [x] Bouton téléchargement par épisode
- [x] Progress indicator
- [x] Gestion du cache audio
- [x] Suppression sélective

### 2.4 Queue offline

- [x] Stockage des actions en attente
- [x] Traitement automatique au retour online
- [x] UI indicateur d'actions en attente

### 2.5 Indicateurs UI

- [x] Statut réseau (online/offline) - OfflineBanner
- [x] Statut téléchargement par épisode
- [x] Espace de stockage utilisé

---

## Phase 3: Internationalisation

**Objectif**: Application disponible en français et anglais.

### 3.1 Setup i18n

- [x] Configurer i18next
- [x] Créer structure locales/
- [x] Language detector

### 3.2 Extraction des textes

- [x] Extraire tous les textes FR dans fr.json
- [x] Créer traductions EN
- [x] Pluralisation
- [ ] Formatage dates/nombres

### 3.3 UI

- [x] Sélecteur de langue dans Settings
- [x] Persistence du choix (localStorage)
- [ ] Tests multilingues

---

## Phase 4: Synchronisation

**Objectif**: Intégration optionnelle avec balados.sync.

### 4.1 Client API

- [ ] Créer `services/sync/client.ts`
- [ ] Endpoints: sync, subscriptions, play
- [ ] Gestion JWT tokens
- [ ] Refresh token automatique

### 4.2 Flow de connexion

- [ ] UI connexion serveur
- [ ] Stockage sécurisé du token
- [ ] Déconnexion propre

### 4.3 Synchronisation

- [ ] Sync initial complet
- [ ] Sync incrémental (delta)
- [ ] Résolution de conflits
- [ ] Queue pour actions offline

### 4.4 CORS Proxy via serveur

- [ ] Utiliser proxy serveur si connecté
- [ ] Fallback sur proxies locaux

### 4.5 UI Sync

- [ ] Settings de synchronisation
- [ ] Indicateur de statut sync
- [ ] Historique/logs de sync
- [ ] Gestion des erreurs

---

## Phase 5: Tendances & Découverte

**Objectif**: Fonctionnalités sociales via balados.sync.

### 5.1 Trending (avec serveur)

- [ ] Page Tendances
- [ ] Top podcasts
- [ ] Épisodes populaires
- [ ] Refresh automatique

### 5.2 Statistiques locales

- [ ] Event logging local
- [ ] Page Stats personnelles
- [ ] Graphiques temps d'écoute
- [ ] Top podcasts personnels

### 5.3 Recherche améliorée

- [ ] Recherche dans iTunes/PodcastIndex
- [ ] Suggestions basées sur abonnements
- [ ] Import OPML

---

## Priorités par criticité

### Must Have (Phase 1)
- Lecture audio fonctionnelle
- Gestion abonnements
- Persistence locale
- Gestion proxies avec fallback

### Should Have (Phase 2-3)
- PWA installable
- Mode offline
- i18n FR/EN

### Nice to Have (Phase 4-5)
- Sync avec serveur
- Tendances
- Stats avancées

---

## Métriques de succès

| Métrique | Cible |
|----------|-------|
| Lighthouse PWA | > 90 |
| Lighthouse Performance | > 80 |
| First Contentful Paint | < 1.5s |
| Time to Interactive | < 3s |
| Test coverage | > 70% |
| Bundle size | < 200KB gzipped |

---

## Dépendances techniques

```json
{
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "@tanstack/react-query": "^5.x",
    "dexie": "^4.x",
    "dexie-react-hooks": "^1.x",
    "react-i18next": "^14.x",
    "i18next": "^23.x",
    "i18next-browser-languagedetector": "^7.x"
  },
  "devDependencies": {
    "vitest": "^2.x",
    "@testing-library/react": "^15.x",
    "vite-plugin-pwa": "^0.19.x",
    "workbox-precaching": "^7.x",
    "workbox-routing": "^7.x",
    "workbox-strategies": "^7.x"
  }
}
```
