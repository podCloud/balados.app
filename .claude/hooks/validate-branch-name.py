#!/usr/bin/env python3
import json
import sys
import re

try:
    input_data = json.load(sys.stdin)
except json.JSONDecodeError as e:
    print(f"Error: Invalid JSON input: {e}", file=sys.stderr)
    sys.exit(1)

tool_name = input_data.get("tool_name", "")
tool_input = input_data.get("tool_input", {})
command = tool_input.get("command", "")

# Only validate git checkout -b commands
if tool_name != "Bash" or "git checkout -b" not in command:
    sys.exit(0)

# Extract branch name
match = re.search(r'git checkout -b\s+([^\s]+)', command)
if not match:
    sys.exit(0)

branch_name = match.group(1)

# Allow main and develop branches
if branch_name in ["main", "develop"]:
    sys.exit(0)

# Validate branch naming convention for balados.app
# Patterns: feature/issue-N-slug, fix/issue-N-slug, or feature/descriptive-name
valid_patterns = [
    r'^feature/issue-\d+-[a-z0-9-]+$',  # feature/issue-42-add-dark-mode
    r'^fix/issue-\d+-[a-z0-9-]+$',       # fix/issue-42-fix-bug
    r'^feature/[a-z0-9-]+$',             # feature/add-dark-mode
    r'^fix/[a-z0-9-]+$',                 # fix/memory-leak
    r'^hotfix/[a-z0-9-]+$',              # hotfix/critical-fix
    r'^release/v\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$',  # release/v1.0.0
]

if not any(re.match(pattern, branch_name) for pattern in valid_patterns):
    reason = f"""❌ Invalid branch name: {branch_name}

Branch names must follow these patterns:
  • feature/issue-<number>-<slug>  (for GitHub issues)
  • feature/<descriptive-name>
  • fix/issue-<number>-<slug>
  • fix/<descriptive-name>
  • hotfix/<descriptive-name>
  • release/v<MAJOR>.<MINOR>.<PATCH>

Examples:
  ✅ feature/issue-42-add-dark-mode
  ✅ feature/add-i18n-support
  ✅ fix/issue-15-cors-error
  ✅ fix/memory-leak
  ✅ release/v1.0.0

Invalid:
  ❌ {branch_name}
  ❌ feat/something (use 'feature/' not 'feat/')
  ❌ Feature/Name (use lowercase)
  ❌ feature/Add_Feature (use kebab-case)

💡 Use lowercase kebab-case for branch names."""

    output = {
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "deny",
            "permissionDecisionReason": reason
        }
    }
    print(json.dumps(output))
    sys.exit(0)

# Allow the command
sys.exit(0)
