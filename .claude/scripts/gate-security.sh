#!/usr/bin/env bash
# MSS Technologies — Security Gate (READ-ONLY)
#
# Scans authored source for the violations Constitution Article VII and
# .claude/rules/common.md prohibit outright.
#
# Reports file:line only. NEVER prints a matched secret value.
# Modifies nothing.
#
#   .claude/scripts/gate-security.sh                 whole repo
#   .claude/scripts/gate-security.sh report-engine   one project
#   .claude/scripts/gate-security.sh --staged        staged changes only

set -uo pipefail

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$REPO_ROOT" || exit 1

STAGED_ONLY=0
TARGET="projects"
for arg in "$@"; do
  case "$arg" in
    --staged) STAGED_ONLY=1 ;;
    -*) echo "unknown option: $arg" >&2; exit 2 ;;
    *) TARGET="projects/$arg" ;;
  esac
done

readonly SKIP_DIRS=(
  --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=build
  --exclude-dir=coverage --exclude-dir=.git --exclude-dir=bin
  --exclude-dir=obj --exclude-dir=deploy --exclude-dir=dist-webresource
  --exclude-dir=.next --exclude-dir=out --exclude-dir=.vite
)
readonly SOURCE_TYPES=(
  --include=*.ts --include=*.tsx --include=*.cs
  --include=*.mjs --include=*.js --include=*.jsx
)

critical=0
warnings=0

# Prints matches as file:line with the offending text withheld.
#   $4 drop_filter — lines matching this are discarded
#   $5 keep_filter — if set, ONLY lines matching this are kept
reportLocations() {
  local label="$1" severity="$2" pattern="$3" extra_filter="${4:-}" keep_filter="${5:-}"
  local hits

  if [ "$STAGED_ONLY" -eq 1 ]; then
    local staged
    staged=$(git diff --cached --name-only --diff-filter=ACM \
             | grep -E '\.(ts|tsx|cs|mjs|js|jsx)$' || true)
    [ -z "$staged" ] && { printf '  [SKIP] %-46s no staged source files\n' "$label"; return; }
    hits=$(printf '%s\n' "$staged" | xargs -r grep -nE "$pattern" 2>/dev/null || true)
  else
    hits=$(grep -rnE "$pattern" "$TARGET" "${SOURCE_TYPES[@]}" "${SKIP_DIRS[@]}" 2>/dev/null || true)
  fi

  [ -n "$extra_filter" ] && hits=$(printf '%s\n' "$hits" | grep -vE "$extra_filter" || true)
  [ -n "$keep_filter" ] && hits=$(printf '%s\n' "$hits" | grep -E "$keep_filter" || true)

  # An explicitly blessed line carries `gate-security:allow <reason>`.
  # Blessing is deliberate and reviewable; weakening a pattern is neither.
  hits=$(printf '%s\n' "$hits" | grep -v 'gate-security:allow' || true)

  local count
  count=$(printf '%s\n' "$hits" | grep -c . || true)

  if [ "$count" -eq 0 ]; then
    printf '  [PASS] %s\n' "$label"
    return
  fi

  if [ "$severity" = "critical" ]; then
    printf '  [FAIL] %-46s %d occurrence(s)\n' "$label" "$count"
    critical=$((critical + count))
  else
    printf '  [WARN] %-46s %d occurrence(s)\n' "$label" "$count"
    warnings=$((warnings + count))
  fi

  printf '%s\n' "$hits" | head -6 | cut -d: -f1,2 | sed 's/^/         /'
  [ "$count" -gt 6 ] && printf '         ... and %d more\n' "$((count - 6))"
}

echo
echo "Security Gate — Constitution Article VII"
echo "========================================"
[ "$STAGED_ONLY" -eq 1 ] && echo "scope: staged changes only" || echo "scope: $TARGET"
echo

readonly TEST_PATHS='(\.test\.|\.spec\.|/tests?/|__tests__|/mocks?/|/e2e/|fixture)'
readonly CREDENTIAL_LITERAL='(client_?secret|clientSecret|api_?key|apiKey|password|passwd)[[:space:]]*[:=][[:space:]]*["'"'"'][^"'"'"']{12,}'
readonly CREDENTIAL_SAFE='(process\.env|import\.meta\.env|Environment\.|\.env|config\.|placeholder|example|xxx|YOUR_|<.*>)'

echo "Secrets"
reportLocations "assigned credential literal" critical \
  "$CREDENTIAL_LITERAL" "$CREDENTIAL_SAFE|$TEST_PATHS"
reportLocations "credential literal in test fixture" warning \
  "$CREDENTIAL_LITERAL" "$CREDENTIAL_SAFE" "$TEST_PATHS"
reportLocations "Azure AD secret shape" critical \
  '["'"'"'][A-Za-z0-9~._-]{3}8Q~[A-Za-z0-9~._-]{20,}["'"'"']'
reportLocations "bearer token literal" critical \
  'Bearer[[:space:]]+[A-Za-z0-9._-]{30,}' \
  '(\$\{|\+ *token|Bearer \$|example)'

echo
echo "Injection and code execution"
reportLocations "eval or dynamic Function" critical \
  '(^|[^a-zA-Z0-9_.])(eval|new Function)[[:space:]]*\(' \
  '(//|\*|evaluate|Evaluat)'
# Requires an identifier after the `+`. Literal-to-literal concatenation of a
# static query is not injection; interpolating a variable into one is.
reportLocations "variable concatenated into SQL or FetchXML" critical \
  '"(SELECT|INSERT|UPDATE|DELETE|<fetch)[^"]*"[[:space:]]*\+[[:space:]]*[a-zA-Z_$]'

echo
echo "Logging and hygiene"
reportLocations "console.log in source" warning \
  'console\.log[[:space:]]*\(' \
  '(\.test\.|\.spec\.|/scripts/|/tests/|__tests__|/mocks?/|/e2e/|vite\.config|\.config\.)'
reportLocations "hardcoded GUID literal" warning \
  '["'"'"'][0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}["'"'"']' \
  '(\.test\.|\.spec\.|/tests?/|__tests__|/mocks?/|/seed|/scripts/|fixture)'

echo
echo "----------------------------------------"
printf 'critical: %d   warnings: %d\n\n' "$critical" "$warnings"

cat <<'NOTE'
Matched text is withheld by design — this gate prints locations only, so its
own output can never leak a credential into a log or transcript.

A hardcoded GUID outside tests and seeds is ANTI-001: record ids differ per
org, so the config works in dev and silently no-ops elsewhere.
NOTE
echo

[ "$critical" -gt 0 ] && exit 1
exit 0
