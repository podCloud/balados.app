# Workflow stack — balados.app (React 19 / TS strict / Vite 8 PWA)

## Commands
- Install (worktree) : `npm ci` — jamais de symlink vers le `node_modules` du checkout principal.
- Lint : `npm run lint` (Biome) | autofix : `npm run lint:fix`
- Test : `npx vitest run` (suite complète, ~480 tests) | un fichier : `npx vitest run src/path/file.test.ts`
- Build : `npm run build` (tsc + Vite)
- Gate avant commit : `npm run lint && npm run build && npx vitest run`

## Conventions
- Offline-first ; IndexedDB via Dexie 4 (écritures multi-tables dans `db.transaction`) ; TanStack Query v5 ; i18n obligatoire (fr/en dans `src/services/i18n/locales/`) ; TypeScript strict (pas de `any`) ; Tailwind utilities only.
- Encodage serveur : base64url sans padding via `src/utils/rssEncoding.ts` (`encodeRssFeed`, `encodeRssItem`).
- Branches : `feature/issue-<n>-<slug>` / `fix/issue-<n>-<slug>`. Worktrees dans `.worktrees/` (gitignoré).
- Commit types : feat|fix|refactor|docs|test|chore. Auteur : Claude <noreply@anthropic.com>.
- Doc avec le code : `docs/SYNC.md`, `docs/ROADMAP.md`, `CLAUDE.md` dans le même commit quand le comportement change.

## Pièges connus
- Le hook pre-commit (`.githooks/`, activé par `postinstall`) lance Biome sur les fichiers stagés : après un script d'édition, relancer `npm run lint:fix` puis vérifier par `grep` que toutes les modifications attendues sont présentes (une assertion sur du texte reformaté casse en silence).
- Mocks Vitest de `../services/storage` : exposer `SETTINGS_ID`, `db.transaction`, `db.settings.put`, sinon `authEvents` prend sa branche d'échec et les tests passent à vide.
- Mocks `t` (i18n) dans les tests de composants : fonction stable, sinon les effets dépendant de `[t]` rejouent.
- Monter `@vitejs/plugin-react` de 5 à 6 depuis un lockfile en 5 donne un `ERESOLVE` de npm 11 (chaîne optionnelle `@rolldown/plugin-babel` → `@babel/plugin-transform-runtime` 8 → `@babel/core` 8, contre le Babel 7 de `workbox-build`). Le lockfile en 6 n'a plus ce problème : pour une montée similaire, un `overrides` temporaire le temps du `npm install`, puis le retirer.
- Ne pas supprimer `package-lock.json` pour le régénérer : npm 11.19 plante sans lockfile (`Cannot read properties of null (reading 'edgesOut')`, arborist pendant la résolution des peers de vitest). `npm ci` et `npm install` avec le lockfile fonctionnent.
- Vérification navigateur : le profil Playwright est persistant. Un service worker de production enregistré sur un port réutilisé ensuite par `vite` (dev) continue de servir l'ancien build ; désinscrire les service workers avant de changer de mode sur un même port.
- Tests flaky connus : `ListeningHistory` pagination sous charge (#76).
- Sous très forte charge (plusieurs agents en parallèle), Vitest peut échouer à démarrer des workers (`[vitest-pool]: Failed to start forks worker ... Timeout`) : des fichiers entiers manquent au rapport. Relancer avant de conclure à une régression.

## PR
- Créer la PR via `~/.config/podclaude/gh.sh pr create --assignee pofmagicfingers …`
- Ne pas ajouter de label de review automatique (la review est gérée en local par la skill).

## Tests qui échouent
- Ne jamais ignorer un test en échec : créer une issue GitHub pour le tracker.
