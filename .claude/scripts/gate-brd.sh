#!/usr/bin/env bash
# Maqsad AI — BRD Quality Gate (READ-ONLY)
#
# "Unit tests for the requirements." Checks a BRD for the qualities that make it
# safe to build against: no unresolved uncertainty, prioritized testable stories,
# IDs, acceptance criteria, and no vague quantifiers. Adopted from GitHub Spec-Kit.
#
# Modifies nothing. See .claude/protocols/requirements-quality.md
#
#   .claude/scripts/gate-brd.sh projects/<name>/brd.md
#   .claude/scripts/gate-brd.sh --all        every brd*.md under projects/

set -uo pipefail

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$REPO_ROOT" || exit 1

gradeOne() {
  local brd="$1"
  [ -f "$brd" ] || { printf '  [SKIP] %s — not found\n' "$brd"; return 0; }

  local fail=0 warn=0

  # The one hard block: unresolved uncertainty markers.
  local clarif
  clarif=$(grep -c 'NEEDS CLARIFICATION' "$brd" 2>/dev/null) || clarif=0
  if [ "$clarif" -gt 0 ]; then
    printf '  [FAIL] %-3s unresolved [NEEDS CLARIFICATION] marker(s)\n' "$clarif"
    fail=$((fail + 1))
  else
    printf '  [PASS] no unresolved clarification markers\n'
  fi

  # Prioritized user stories.
  if grep -qE 'Priority:? *P[0-9]|\(P[123]\)|\[P[123]\]' "$brd" 2>/dev/null; then
    printf '  [PASS] prioritized user stories present\n'
  else
    printf '  [WARN] no prioritized (P1/P2/P3) user stories\n'; warn=$((warn + 1))
  fi

  # Requirement IDs.
  if grep -qE '\b(FR|NFR)-[0-9]{2,3}\b' "$brd" 2>/dev/null; then
    printf '  [PASS] requirement IDs present\n'
  else
    printf '  [WARN] no FR-/NFR- requirement IDs\n'; warn=$((warn + 1))
  fi

  # Acceptance criteria.
  if grep -qiE 'acceptance|given .* when .* then|\bAC-[0-9]' "$brd" 2>/dev/null; then
    printf '  [PASS] acceptance criteria present\n'
  else
    printf '  [WARN] no acceptance criteria / Given-When-Then\n'; warn=$((warn + 1))
  fi

  # Requirements Quality Checklist section.
  if grep -qiE 'quality checklist|requirements checklist' "$brd" 2>/dev/null; then
    printf '  [PASS] requirements quality checklist section present\n'
  else
    printf '  [WARN] no requirements quality checklist section\n'; warn=$((warn + 1))
  fi

  # Vague quantifiers — a clarity smell. Word-boundary matched, case-insensitive.
  local vague
  vague=$(grep -oiwE 'fast|slow|quick|prominent|robust|scalable|several|many|few|some|user-friendly|intuitive|seamless' "$brd" 2>/dev/null | wc -l)
  vague=$(printf '%s' "$vague" | tr -d ' ')
  if [ "${vague:-0}" -gt 8 ]; then
    printf '  [WARN] %-3s vague quantifier(s) — quantify or the requirement is not testable\n' "$vague"
    warn=$((warn + 1))
  else
    printf '  [PASS] few vague quantifiers (%s)\n' "${vague:-0}"
  fi

  printf '        → %s\n\n' "$([ "$fail" -gt 0 ] && echo "FAIL ($fail hard, $warn warn)" || echo "PASS ($warn warn)")"
  return "$fail"
}

echo
echo "BRD Quality Gate — requirements are unit-tested before build"
echo "==========================================================="
echo

total_fail=0
if [ "${1:-}" = "--all" ]; then
  while IFS= read -r brd; do
    printf '%s\n' "$brd"
    gradeOne "$brd" || total_fail=$((total_fail + 1))
  done < <(git ls-files 'projects/**brd*.md' 2>/dev/null | grep -iE 'brd.*\.md' | grep -v approval | sort)
elif [ -n "${1:-}" ]; then
  gradeOne "$1" || total_fail=1
else
  echo "usage: gate-brd.sh <brd-file> | --all" >&2
  exit 2
fi

echo "-----------------------------------------------------------"
printf 'BRDs with a hard block (unresolved clarifications): %d\n' "$total_fail"
echo "Warnings are craft smells; the FAIL block is the one that stops CEO approval."
echo "Detail: .claude/protocols/requirements-quality.md"
echo

[ "$total_fail" -gt 0 ] && exit 1
exit 0
