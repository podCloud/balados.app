# Workflow stack — balados.app (React/TS PWA)

## Commands
- Lint: `npm run lint` (Biome)  | autofix: `npm run lint:fix`
- Test: `npm test` (Vitest)
- Build: `npm run build` (tsc + Vite)

## Conventions
- Offline-first ; IndexedDB via Dexie ; i18n obligatoire (fr/en) ; TypeScript strict (pas de `any`) ; Tailwind utilities only.
- Branches: `feature/issue-<n>-<slug>` / `fix/issue-<n>-<slug>`.
- Commit types: feat|fix|refactor|docs|test|chore. Auteur: Claude <noreply@anthropic.com>.

## PR
- Créer la PR via `~/.config/podclaude/gh.sh pr create --assignee pofmagicfingers …`
- Ne pas ajouter de label de review automatique (la review est gérée en local par la skill).

## Tests qui échouent
- Ne jamais ignorer un test en échec : créer une issue GitHub pour le tracker.
