#!/usr/bin/env bash
# Maqsad AI — Preflight Gate (READ-ONLY)
#
# Validates locally what would otherwise fail after a push: staged-file safety,
# typecheck, lint, and tests. Runs no installer and changes no file.
#
#   .claude/scripts/gate-preflight.sh                          staged-file checks only
#   .claude/scripts/gate-preflight.sh dynamic-form-engine/backend   also build that package

set -uo pipefail

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$REPO_ROOT" || exit 1

PACKAGE="${1:-}"
passed=0
failed=0
skipped=0

record() {
  local state="$1" label="$2" detail="${3:-}"
  case "$state" in
    pass) printf '  [PASS] %s\n' "$label"; passed=$((passed + 1)) ;;
    fail) printf '  [FAIL] %-44s %s\n' "$label" "$detail"; failed=$((failed + 1)) ;;
    skip) printf '  [SKIP] %-44s %s\n' "$label" "$detail"; skipped=$((skipped + 1)) ;;
  esac
}

echo
echo "Preflight Gate"
echo "=============="
echo

echo "Staged changes"
STAGED=$(git diff --cached --name-only --diff-filter=ACM 2>/dev/null || true)

if [ -z "$STAGED" ]; then
  record skip "staged-file checks" "nothing staged"
else
  staged_count=$(printf '%s\n' "$STAGED" | grep -c .)
  record pass "$staged_count file(s) staged"

  env_files=$(printf '%s\n' "$STAGED" | grep -E '(^|/)\.env($|\.)' | grep -v '\.example$' || true)
  [ -z "$env_files" ] \
    && record pass "no .env files staged" \
    || record fail "no .env files staged" "$(printf '%s' "$env_files" | tr '\n' ' ')"

  vendored=$(printf '%s\n' "$STAGED" | grep -E '(^|/)(node_modules|dist|build|coverage)/' || true)
  [ -z "$vendored" ] \
    && record pass "no build output or vendored code staged" \
    || record fail "no build output or vendored code staged" \
       "$(printf '%s\n' "$vendored" | grep -c .) file(s)"

  if bash "$REPO_ROOT/.claude/scripts/gate-security.sh" --staged >/dev/null 2>&1; then
    record pass "no critical security findings in staged source"
  else
    record fail "no critical security findings in staged source" \
      "run gate-security.sh --staged"
  fi
fi

echo
echo "Repository"
current_branch=$(git branch --show-current 2>/dev/null || echo "")
if [ "$current_branch" = "main" ] || [ "$current_branch" = "master" ]; then
  record fail "not committing directly to the default branch" "on '$current_branch'"
else
  record pass "on a feature branch ('$current_branch')"
fi

if [ -z "$PACKAGE" ]; then
  echo
  echo "--------------"
  printf 'passed: %d   failed: %d   skipped: %d\n' "$passed" "$failed" "$skipped"
  printf '\nPass a package path to also run typecheck, lint and tests.\n'
  printf 'e.g. gate-preflight.sh dynamic-form-engine/backend\n\n'
  [ "$failed" -gt 0 ] && exit 1
  exit 0
fi

PACKAGE_DIR="projects/$PACKAGE"
[ -d "$PACKAGE_DIR" ] || PACKAGE_DIR="$PACKAGE"
if [ ! -f "$PACKAGE_DIR/package.json" ]; then
  echo
  echo "no package.json at $PACKAGE_DIR" >&2
  exit 2
fi

hasScript() {
  node -e '
    const fs = require("fs");
    const pkg = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    process.exit((pkg.scripts || {})[process.argv[2]] ? 0 : 1);
  ' "$PACKAGE_DIR/package.json" "$1" 2>/dev/null
}

runScript() {
  local script="$1" label="$2"
  if ! hasScript "$script"; then
    record skip "$label" "no '$script' script"
    return
  fi
  if (cd "$PACKAGE_DIR" && npm run --silent "$script" >/dev/null 2>&1); then
    record pass "$label"
  else
    record fail "$label" "npm run $script failed — run it directly for detail"
  fi
}

echo
echo "Package: $PACKAGE_DIR"
if [ ! -d "$PACKAGE_DIR/node_modules" ]; then
  record skip "dependencies installed" "no node_modules — run npm install first"
  echo
  echo "--------------"
  printf 'passed: %d   failed: %d   skipped: %d\n\n' "$passed" "$failed" "$skipped"
  [ "$failed" -gt 0 ] && exit 1
  exit 0
fi

record pass "dependencies installed"
runScript typecheck "typecheck"
hasScript typecheck || runScript type-check "typecheck"
runScript lint "lint"
runScript test "tests"

echo
echo "--------------"
printf 'passed: %d   failed: %d   skipped: %d\n\n' "$passed" "$failed" "$skipped"
[ "$failed" -gt 0 ] && exit 1
exit 0
