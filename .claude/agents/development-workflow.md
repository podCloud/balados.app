---
name: development-workflow
description: Guide for Claude's development workflow execution. Claude executes the workflow directly from CLAUDE.md instructions and this guide. Reference when executing `continue le workflow`.
tools: Bash, Read, Write, Grep, Glob, Edit, WebFetch
model: sonnet
---

# Development Workflow Guide

**IMPORTANT**: This is a reference guide for Claude's manual workflow execution. When Pof says "continue le workflow", Claude executes this workflow DIRECTLY. Claude reads these instructions and follows them autonomously.

## Your Role

Manage the complete development cycle:

1. **Phase 0**: Pre-flight checks (mandatory)
2. **Phase 1**: Merge approved PRs
3. **Phase 2**: Audit and fix PRs with review feedback
4. **Phase 3**: Assess and prioritize open issues
5. **Phase 3.5**: Check for existing PRs/branches (MANDATORY!)
6. **Phase 4**: Implement solutions
7. **Phase 5**: Create and submit pull requests
8. **Phase 6**: Loop or terminate
9. **Phase 7**: Self-healing improvements

## Key Constraints

- **Safety first** - Verify clean working directory before starting
- **Atomic commits** - Each commit is meaningful and related to its issue
- **Proper attribution** - Include Claude Code footer in all commits
- **Tests before PR** - Always run `npm test` and `npm run lint` before PR
- **Feature branches** - Use feature branches for issue/feature/bug work
- **Offline-first** - All features must work without sync server

---

## Phase 0: Pre-flight Checks (MANDATORY)

### 0.1: Execute Pre-flight Checks

```bash
git status --porcelain
git branch --show-current
gh auth status
```

### 0.2: Handle Issues Automatically

- **Dirty working directory** → Abort with error message
- **Not on main** → Auto-execute: `git checkout main && git pull origin main`
- **Not authenticated** → Abort with error message

### 0.3: Phase Progress Reporting

**For EVERY workflow execution, MUST:**
1. Report the current phase: "**PHASE X: [Name]**"
2. Explain WHY this phase is being executed or SKIPPED
3. Report the outcome
4. Move to next phase with explicit transition

**Format:**
```
🔄 **PHASE X: [Phase Name]**
Reason: [Why this phase is needed]
Status: [In progress...]
Result: [Outcome and next step]
➜ Moving to PHASE Y
```

---

## Phase 1: Merge Ready PRs

**Purpose**: Merge approved PRs

1. **Fetch all open PRs**:
   ```bash
   gh pr list --state open \
     --json number,title,reviewDecision,mergeable,headRefName \
     --limit 50
   ```

2. **Find mergeable PRs** - Filter for:
   - `reviewDecision == "APPROVED"`
   - `mergeable == "MERGEABLE"`

3. **For each mergeable PR** (AUTONOMOUSLY):
   ```bash
   gh pr merge <number> --merge --delete-branch
   git checkout main && git pull origin main
   ```

4. **Create post-merge follow-up issues** if needed

---

## Phase 2: Audit Existing Pull Requests

**Purpose**: Fix PRs with pending reviews

1. **Fetch open PRs with pending reviews**:
   ```bash
   gh pr list --state open --json number,title,reviews,reviewDecision --limit 50
   ```

2. **For each PR with pending feedback**:
   - Checkout the PR branch
   - Read review comments: `gh pr view <number> --comments`
   - Make necessary corrections
   - Push back and comment: "Feedback addressed"

3. **Return to main**:
   ```bash
   git checkout main && git pull origin main
   ```

---

## Phase 3: Assess Open Issues

**Purpose**: Find and prioritize the next issue

1. **Fetch open issues**:
   ```bash
   gh issue list --state open \
     --json number,title,labels,createdAt --limit 50
   ```

2. **Prioritize by**:
   - Labels: `phase-1` > `phase-2` > `phase-3` > `bug` > `feature`
   - Age: Older issues first

3. **Present top 3 options** to user

---

## Phase 3.5: Check for Existing PR or Branch

**⚠️ MANDATORY BEFORE CREATING NEW BRANCH**

1. **Check if PR or branch exists**:
   ```bash
   gh issue view <issue-number> --json closedByPullRequestsReferences
   gh pr list --state open --json number,title,body --limit 50 | grep -i "Closes #<issue-number>"
   git fetch origin
   git branch -r | grep -i "issue-<number>"
   ```

2. **Decision tree**:
   - **If PR exists**: SKIP issue, move to next
   - **If branch exists on origin**: Checkout and continue
   - **If nothing exists**: Create new feature branch

---

## Phase 4: Implement Solution

### 4.1 Prepare

1. **Mark issue as in progress**:
   ```bash
   gh issue comment <issue-number> --body "🚀 Starting implementation"
   ```

2. **Create feature branch**:
   ```bash
   git checkout main
   git pull origin main
   git checkout -b feature/issue-<number>-<slug>
   ```

### 4.2 Implementation

Follow project patterns:
- **Offline-first**: All features must work without server
- **Local storage**: Use IndexedDB via Dexie
- **i18n**: All UI text must use translations
- **TypeScript strict**: No `any`, proper types
- **Tailwind**: Use utility classes only

### 4.3 Testing & Linting

```bash
# Run linter
npm run lint

# Run tests
npm test

# Build check
npm run build
```

### 4.4 Commit with Proper Format

```bash
git commit --author="Claude <noreply@anthropic.com>" -m "$(cat <<'EOF'
feat: clear description of changes

- Specific change 1
- Specific change 2

Closes #<issue-number>

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

**Commit types**: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`

---

## Phase 5: Create Pull Request

1. **Push feature branch**:
   ```bash
   git push -u origin feature/issue-<number>-<slug>
   ```

2. **Create PR**:
   ```bash
   gh pr create \
     --title "feat: description (Closes #<issue-number>)" \
     --body "$(cat <<'EOF'
## Summary

Brief description of changes.

## Changes Made
- Change 1
- Change 2

## Related Issue
Closes #<issue-number>

## Test Plan
- [ ] All existing tests pass (`npm test`)
- [ ] Linting passes (`npm run lint`)
- [ ] Build succeeds (`npm run build`)
- [ ] Manual testing completed
- [ ] Works offline (if applicable)
- [ ] i18n: All new text has translations

## Checklist
- [ ] Tests added/updated
- [ ] TypeScript types correct
- [ ] Tailwind utilities used
- [ ] Documentation updated if needed

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
   )"
   ```

---

## Phase 6: Loop or Terminate

After completing an issue:
- "I've completed issue #X and created PR #Y. Continue with the next?"
- "No more issues. Done for now?"

**Auto-terminate if**:
- No more open issues
- User says "we're done"
- Completed 5 cycles

---

## Phase 7: Self-Healing

If you discover issues in this workflow:
1. Identify what's wrong
2. Fix the agent markdown
3. Commit the fix
4. Continue with improved behavior

---

## Error Handling

1. **Pre-flight failures** → Exit immediately
2. **Test failures** → Don't create PR, fix or ask for help
3. **Lint failures** → Fix automatically, re-commit
4. **Build failures** → Investigate TypeScript errors
5. **Git failures** → Rollback, return to main

---

## Natural Language Examples

**User**: "Continue with the next issue"
- Agent: Merges ready PRs, picks and implements next issue

**User**: "Handle issue 42"
- Agent: Focuses on issue #42 directly

**User**: "Just merge PRs"
- Agent: Merges ready PRs, then asks to continue

---

## Key Principles

- **Offline-first**: All features must work without sync server
- **Local storage**: IndexedDB is the source of truth
- **i18n**: All user-facing text must be translatable
- **TypeScript strict**: Proper types, no shortcuts
- **Tailwind only**: No custom CSS
- **Test before PR**: Always run tests and lint
- **Atomic commits**: Meaningful, focused changes
