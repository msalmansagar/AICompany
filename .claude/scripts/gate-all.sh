#!/usr/bin/env bash
# Maqsad AI — Run every repository-wide gate and summarise.
#
# Modifies nothing. Exits non-zero if any gate fails.
#
#   .claude/scripts/gate-all.sh              summary only
#   .claude/scripts/gate-all.sh --verbose    full output from each gate

set -uo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd "$SCRIPT_DIR/../.." && pwd)
cd "$REPO_ROOT" || exit 1

VERBOSE=0
[ "${1:-}" = "--verbose" ] && VERBOSE=1

# CRM deploy gate needs a package argument, so it is not part of the sweep.
GATES=(
  "preflight:gate-preflight.sh"
  "security:gate-security.sh"
  "coverage:gate-coverage.sh"
  "traceability:traceability-gate.sh"
)

results=()
any_failed=0

echo
echo "Maqsad AI — Quality Gates"
echo "========================="

for entry in "${GATES[@]}"; do
  name=${entry%%:*}
  script=${entry#*:}
  path="$SCRIPT_DIR/$script"

  if [ ! -f "$path" ]; then
    results+=("$name|MISSING|$script not found")
    any_failed=1
    continue
  fi

  if [ "$VERBOSE" -eq 1 ]; then
    printf '\n--- %s ---\n' "$name"
    bash "$path"
    status=$?
  else
    output=$(bash "$path" 2>&1)
    status=$?
  fi

  if [ "$status" -eq 0 ]; then
    results+=("$name|PASS|")
  else
    results+=("$name|FAIL|exit $status — run .claude/scripts/$script")
    any_failed=1
  fi
done

echo
printf '%-16s %-6s %s\n' "GATE" "RESULT" "DETAIL"
printf '%-16s %-6s %s\n' "----" "------" "------"
for row in "${results[@]}"; do
  IFS='|' read -r name status detail <<< "$row"
  printf '%-16s %-6s %s\n' "$name" "$status" "$detail"
done

echo
if [ "$any_failed" -eq 1 ]; then
  echo "One or more gates failed. A failing gate is information, not a verdict —"
  echo "read the detail before deciding whether it blocks the work."
  echo
  exit 1
fi
echo "All gates passed."
echo
exit 0
