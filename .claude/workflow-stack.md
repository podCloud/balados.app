# Workflow stack — balados.app (React 19 / TS strict / Vite 7 PWA)

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
- Tests flaky connus : `ListeningHistory` pagination sous charge (#76).

## PR
- Créer la PR via `~/.config/podclaude/gh.sh pr create --assignee pofmagicfingers …`
- Ne pas ajouter de label de review automatique (la review est gérée en local par la skill).

## Tests qui échouent
- Ne jamais ignorer un test en échec : créer une issue GitHub pour le tracker.
