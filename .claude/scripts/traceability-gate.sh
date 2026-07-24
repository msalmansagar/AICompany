#!/usr/bin/env bash
# Maqsad AI — Traceability Gate (READ-ONLY)
#
# Reports which requirement IDs defined in a project's documents are
# referenced by its code, its tests, or its commits.
#
# Modifies nothing. Exits 0 unless --strict is passed.
#
#   .claude/scripts/traceability-gate.sh                 all projects
#   .claude/scripts/traceability-gate.sh report-engine   one project
#   .claude/scripts/traceability-gate.sh --strict        non-zero if gaps

set -uo pipefail

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$REPO_ROOT" || exit 1

STRICT=0
TARGET=""
for arg in "$@"; do
  case "$arg" in
    --strict) STRICT=1 ;;
    -*) echo "unknown option: $arg" >&2; exit 2 ;;
    *) TARGET="$arg" ;;
  esac
done

readonly ID_PATTERN='\b(FR|US|NFR)-[0-9]{2,3}\b'

# Generated and vendored trees hold no authored requirement references, and
# scanning them turns a two-second report into a five-minute one.
readonly SKIP_DIRS=(
  --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=build
  --exclude-dir=coverage --exclude-dir=.git --exclude-dir=bin
  --exclude-dir=obj --exclude-dir=deploy --exclude-dir=dist-webresource
  --exclude-dir=.next --exclude-dir=out --exclude-dir=.vite
)
readonly CODE_TYPES=(
  --include=*.ts --include=*.tsx --include=*.cs
  --include=*.mjs --include=*.js --include=*.jsx
)

definedIdsFor() {
  grep -rhoE "$ID_PATTERN" "$1" --include=*.md "${SKIP_DIRS[@]}" 2>/dev/null | sort -u
}

referencedIdsFor() {
  grep -rhoE "$ID_PATTERN" "$1" "${CODE_TYPES[@]}" "${SKIP_DIRS[@]}" 2>/dev/null | sort -u
}

commitIdsFor() {
  git log --format=%s -- "$1" 2>/dev/null | grep -ohE "$ID_PATTERN" | sort -u
}

countLines() {
  printf '%s\n' "$1" | grep -c . || true
}

total_defined=0
total_linked=0
projects_with_gaps=0

echo
echo "Traceability Gate — requirement IDs defined vs referenced"
echo "========================================================"

for project_dir in projects/*/; do
  project=$(basename "$project_dir")
  [ -n "$TARGET" ] && [ "$project" != "$TARGET" ] && continue
  [ -d "$project_dir" ] || continue

  defined=$(definedIdsFor "$project_dir")
  [ -z "$defined" ] && continue
  defined_count=$(countLines "$defined")

  linked_ids=$(printf '%s\n%s\n' \
    "$(referencedIdsFor "$project_dir")" \
    "$(commitIdsFor "$project_dir")" | grep . | sort -u)

  orphans=$(comm -23 <(printf '%s\n' "$defined") <(printf '%s\n' "$linked_ids"))
  orphan_count=$(countLines "$orphans")
  linked=$((defined_count - orphan_count))

  total_defined=$((total_defined + defined_count))
  total_linked=$((total_linked + linked))

  if [ "$orphan_count" -gt 0 ]; then
    status="GAPS"
    projects_with_gaps=$((projects_with_gaps + 1))
  else
    status="OK"
  fi

  printf '\n%-32s %4s  %3d/%-3d linked (%d%%)\n' \
    "$project" "$status" "$linked" "$defined_count" \
    "$(( defined_count > 0 ? linked * 100 / defined_count : 0 ))"

  if [ "$orphan_count" -gt 0 ]; then
    preview=$(printf '%s\n' "$orphans" | head -12 | tr '\n' ' ')
    if [ "$orphan_count" -gt 12 ]; then
      printf '    unlinked: %s... (+%d more)\n' "$preview" "$((orphan_count - 12))"
    else
      printf '    unlinked: %s\n' "$preview"
    fi
  fi
done

echo
echo "--------------------------------------------------------"
if [ "$total_defined" -gt 0 ]; then
  printf 'TOTAL  %d/%d requirement IDs linked to code, tests or commits (%d%%)\n' \
    "$total_linked" "$total_defined" "$(( total_linked * 100 / total_defined ))"
else
  echo "TOTAL  no requirement IDs found"
fi
printf '       %d project(s) with unlinked requirements\n\n' "$projects_with_gaps"

cat <<'NOTE'
An unlinked ID is a question, not a defect. It may be deferred, out of scope,
or satisfied by configuration rather than code. What it must not be is
forgotten. See .claude/protocols/traceability.md
NOTE
echo

if [ "$STRICT" -eq 1 ] && [ "$projects_with_gaps" -gt 0 ]; then
  exit 1
fi
exit 0
