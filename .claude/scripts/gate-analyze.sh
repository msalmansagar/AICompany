#!/usr/bin/env bash
# Maqsad AI — Cross-Artifact Analysis Gate (READ-ONLY, mechanical subset)
#
# Cross-references requirement IDs across an engagement's BRD, architecture, and
# QA artifacts and reports coverage gaps + placeholders. This is the greppable
# part of .claude/protocols/cross-artifact-analysis.md — the semantic passes
# (duplication, terminology drift, constitution conflicts) need the agent.
#
# Modifies nothing. Adopted from GitHub Spec-Kit /speckit.analyze.
#
#   .claude/scripts/gate-analyze.sh <project>     e.g. customer-loan-portal
#   .claude/scripts/gate-analyze.sh --all

set -uo pipefail

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$REPO_ROOT" || exit 1

readonly ID='\b(FR|NFR)-[0-9]{2,3}\b'

# Match artifacts by keyword, not phase number (naming varies per engagement).
firstMatch() {
  ls "projects/$1/"*.md 2>/dev/null | grep -iE "$2" | grep -iv approval | head -1
}

idsIn() { [ -n "$1" ] && [ -f "$1" ] && grep -ohE "$ID" "$1" 2>/dev/null | sort -u || true; }

analyzeOne() {
  local proj="$1"
  local brd arch qa
  brd=$(firstMatch "$proj" 'brd')
  arch=$(firstMatch "$proj" 'arch|tech')
  qa=$(firstMatch "$proj" 'qa')

  [ -z "$brd" ] && { printf '  [SKIP] %-28s no BRD found\n' "$proj"; return 0; }

  local brd_ids arch_ids qa_ids
  brd_ids=$(idsIn "$brd"); arch_ids=$(idsIn "$arch"); qa_ids=$(idsIn "$qa")
  local nb; nb=$(printf '%s\n' "$brd_ids" | grep -c . || true)
  [ "$nb" -eq 0 ] && { printf '  [SKIP] %-28s BRD has no FR/NFR IDs\n' "$proj"; return 0; }

  # Requirements with no architecture / no QA mention.
  local no_arch no_qa orphan_qa
  if [ -n "$arch" ]; then
    no_arch=$(comm -23 <(printf '%s\n' "$brd_ids") <(printf '%s\n' "$arch_ids") | grep -c . || true)
  else
    no_arch="?"
  fi
  if [ -n "$qa" ]; then
    no_qa=$(comm -23 <(printf '%s\n' "$brd_ids") <(printf '%s\n' "$qa_ids") | grep -c . || true)
    # IDs referenced in QA that don't exist in the BRD → orphan reference.
    orphan_qa=$(comm -13 <(printf '%s\n' "$brd_ids") <(printf '%s\n' "$qa_ids") | grep -c . || true)
  else
    no_qa="?"; orphan_qa=0
  fi

  # Placeholders across all three artifacts.
  local placeholders
  placeholders=$(grep -lcE 'NEEDS CLARIFICATION|TODO|TBD|\?\?\?|<placeholder>' "$brd" ${arch:+"$arch"} ${qa:+"$qa"} 2>/dev/null | awk -F: '{s+=$1} END{print s+0}')

  printf '\n  %s\n' "$proj"
  printf '    requirements (FR/NFR): %s\n' "$nb"
  printf '    no architecture mention: %s%s\n' "$no_arch" "$([ "$no_arch" = "?" ] && echo '  (no arch doc)')"
  printf '    no QA test mention:      %s%s\n' "$no_qa" "$([ "$no_qa" = "?" ] && echo '  (no qa doc)')"
  [ "${orphan_qa:-0}" -gt 0 ] && printf '    QA references %s ID(s) not in the BRD (orphan)\n' "$orphan_qa"
  [ "${placeholders:-0}" -gt 0 ] && printf '    unresolved placeholders across artifacts: %s\n' "$placeholders"

  # Flag the material gaps.
  local flag=0
  [ "$no_qa" != "?" ] && [ "${no_qa:-0}" -gt 0 ] && flag=1
  [ "$no_arch" != "?" ] && [ "${no_arch:-0}" -gt 0 ] && flag=1
  [ "${orphan_qa:-0}" -gt 0 ] && flag=1
  [ "${placeholders:-0}" -gt 0 ] && flag=1
  if [ "$flag" -gt 0 ]; then
    printf '    → REVIEW — run the full semantic analysis (protocol passes A-F)\n'
    return 1
  fi
  printf '    → coverage clean (mechanical); still run passes A/D/F by reading\n'
  return 0
}

echo
echo "Cross-Artifact Analysis Gate — BRD ⟷ architecture ⟷ QA"
echo "======================================================"

flagged=0
if [ "${1:-}" = "--all" ]; then
  for d in projects/*/; do
    p=$(basename "$d")
    ls "projects/$p/"brd*.md >/dev/null 2>&1 || continue
    analyzeOne "$p" || flagged=$((flagged + 1))
  done
elif [ -n "${1:-}" ]; then
  analyzeOne "$1" || flagged=1
else
  echo "usage: gate-analyze.sh <project> | --all" >&2
  exit 2
fi

echo
echo "------------------------------------------------------"
printf 'engagements needing the full semantic pass: %d\n' "$flagged"
echo "This gate does coverage + placeholders only. Duplication, terminology"
echo "drift, and constitution conflicts need reading — see"
echo ".claude/protocols/cross-artifact-analysis.md"
echo
exit 0
