# Roadmap de développement

## Vue d'ensemble des phases

```
Phase 1: Fondations          ████████████████░░░░  80%
Phase 2: PWA & Offline       ░░░░░░░░░░░░░░░░░░░░
Phase 3: Internationalisation████████████░░░░░░░░  60%
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
- [ ] Extraire les composants:
  - [ ] `components/library/Library.tsx`
  - [ ] `components/library/SubscriptionItem.tsx`
  - [ ] `components/podcast/PodcastDetail.tsx`
  - [ ] `components/podcast/EpisodeList.tsx`
  - [ ] `components/player/EpisodePlayer.tsx`
  - [ ] `components/player/PlayerControls.tsx`
- [ ] Migrer vers TanStack Query

### 1.3 Gestion des proxies

- [x] Créer `ProxyManager` avec fallback
- [ ] UI Settings pour gérer les proxies
- [ ] Gestion des erreurs et retry

### 1.4 Stockage local persistant

- [ ] Migration localStorage -> IndexedDB
- [x] Schema Dexie pour toutes les entités
- [ ] Tests de persistence

### 1.5 Tests

- [ ] Tests unitaires services
- [ ] Tests composants critiques
- [ ] Tests d'intégration flux principaux

---

## Phase 2: PWA & Offline

**Objectif**: Application installable fonctionnant hors-ligne.

### 2.1 Setup PWA

- [ ] Créer `manifest.json`
- [ ] Générer les icônes (192, 512, maskable)
- [ ] Configurer Vite PWA plugin
- [ ] Meta tags pour mobile

### 2.2 Service Worker

- [ ] Setup Workbox
- [ ] Stratégies de cache:
  - [ ] App shell (precache)
  - [ ] Flux RSS (network-first)
  - [ ] Images (cache-first)
  - [ ] Audio (cache-first)
- [ ] Background sync pour actions offline

### 2.3 Téléchargement d'épisodes

- [ ] Bouton téléchargement par épisode
- [ ] Progress indicator
- [ ] Gestion du cache audio
- [ ] Suppression sélective

### 2.4 Queue offline

- [ ] Stockage des actions en attente
- [ ] Traitement automatique au retour online
- [ ] UI indicateur d'actions en attente

### 2.5 Indicateurs UI

- [ ] Statut réseau (online/offline)
- [ ] Statut téléchargement par épisode
- [ ] Espace de stockage utilisé

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

- [ ] Sélecteur de langue dans Settings
- [ ] Persistence du choix
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
