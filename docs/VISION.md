# Vision - balados.app

## Qu'est-ce que balados.app?

**balados.app** est un lecteur de podcasts web moderne, conçu selon le principe "local-first" avec synchronisation optionnelle.

## Philosophie

### Comme Bluesky ou Mastodon

L'application fonctionne comme un client fédéré:
- **Standalone**: Fonctionne parfaitement sans serveur
- **Connecté**: Peut se lier à un serveur balados.sync pour la synchronisation multi-appareils
- **Liberté**: L'utilisateur choisit son serveur ou n'en utilise aucun

### Propriété des données

L'utilisateur possède toujours ses données:
- Toutes les données sont stockées localement en premier
- La synchronisation est une copie, pas la source de vérité
- Déconnecter le serveur ne perd aucune donnée
- Exporter/importer les données à tout moment

### Progressive Web App (PWA)

Une vraie application web installable:
- Fonctionne hors-ligne
- Notifications de nouveaux épisodes
- Lecture en arrière-plan
- Installation sur l'écran d'accueil

## Cas d'utilisation

### Alice - Utilisatrice solo

Alice utilise balados.app sur son téléphone:
- Elle s'abonne à des podcasts
- Tout est stocké localement
- Pas besoin de compte ni de serveur
- Ses données restent sur son appareil

### Bob - Multi-appareils

Bob écoute sur son téléphone et son ordinateur:
- Il connecte balados.app à un serveur balados.sync
- Ses abonnements et positions se synchronisent
- S'il perd son téléphone, ses données sont sur le serveur
- Il peut aussi déconnecter et continuer en local

### Charlie - Auto-hébergé

Charlie héberge son propre serveur balados.sync:
- Il contrôle totalement ses données
- Il peut partager son serveur avec sa famille
- Les données ne quittent jamais son infrastructure

## Fonctionnalités principales

### Lecture de podcasts

- Lecture audio/vidéo
- Vitesse de lecture ajustable
- Reprise automatique de la position
- File d'attente de lecture
- Téléchargement pour écoute hors-ligne

### Gestion des abonnements

- Recherche et découverte de podcasts
- Import/export OPML
- Catégorisation et tags
- Notifications de nouveaux épisodes

### Statistiques locales

- Temps d'écoute par jour/semaine/mois
- Podcasts les plus écoutés
- Historique de lecture
- Aucun tracking externe

### Synchronisation (optionnelle)

- Abonnements
- Positions de lecture
- Playlists
- Préférences

### Tendances (avec serveur)

Quand connecté à balados.sync:
- Podcasts populaires
- Nouveaux épisodes tendance
- Découverte basée sur les écoutes de la communauté

## Ce que balados.app n'est PAS

- **Pas un réseau social**: Pas de followers, likes publics, commentaires
- **Pas un hébergeur**: Ne stocke pas les fichiers audio
- **Pas une plateforme**: Lit des flux RSS standard, pas de contenu propriétaire
- **Pas un tracker**: Les stats restent locales sauf choix explicite

## Audience cible

1. **Auditeurs de podcasts** qui veulent une app web sans compte obligatoire
2. **Utilisateurs soucieux de leur vie privée** qui veulent garder le contrôle
3. **Multi-appareils** qui veulent synchroniser sans vendor lock-in
4. **Auto-hébergeurs** qui veulent leur propre infrastructure

## Roadmap simplifiée

1. **Phase 1**: Lecteur fonctionnel (lecture, abonnements, persistence locale)
2. **Phase 2**: PWA complète (offline, installation, notifications)
3. **Phase 3**: Internationalisation (FR/EN)
4. **Phase 4**: Synchronisation optionnelle (balados.sync)
5. **Phase 5**: Tendances et découverte (avec serveur)
