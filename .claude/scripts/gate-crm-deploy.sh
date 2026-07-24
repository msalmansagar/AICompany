#!/usr/bin/env bash
# MSS Technologies — CRM Deployment Gate (READ-ONLY)
#
# Mechanically checks a Dynamics solution package against the packaging rules
# that have caused real import failures. Every check below cost at least one
# failed deployment. See GOT-001..GOT-004 in company-knowledge.json.
#
# Modifies nothing.
#
#   .claude/scripts/gate-crm-deploy.sh <dir>    extracted solution directory
#   .claude/scripts/gate-crm-deploy.sh <zip>    solution ZIP (extracted to temp)

set -uo pipefail

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)

TARGET="${1:-}"
if [ -z "$TARGET" ]; then
  echo "usage: gate-crm-deploy.sh <solution-dir|solution.zip>" >&2
  exit 2
fi
[ -e "$TARGET" ] || { echo "not found: $TARGET" >&2; exit 2; }

WORK_DIR="$TARGET"
CLEANUP=""

if [ -f "$TARGET" ]; then
  case "$TARGET" in
    *.zip)
      WORK_DIR=$(mktemp -d) || exit 2
      CLEANUP="$WORK_DIR"
      if command -v unzip >/dev/null 2>&1; then
        unzip -qo "$TARGET" -d "$WORK_DIR" || { echo "unzip failed" >&2; exit 2; }
      else
        powershell -NoProfile -Command \
          "Expand-Archive -LiteralPath '$TARGET' -DestinationPath '$WORK_DIR' -Force" \
          >/dev/null 2>&1 || { echo "extraction failed — install unzip" >&2; exit 2; }
      fi
      ;;
    *) echo "expected a directory or a .zip" >&2; exit 2 ;;
  esac
fi
trap '[ -n "$CLEANUP" ] && rm -rf "$CLEANUP"' EXIT

passed=0
failed=0

# grep -c prints 0 and exits 1 on no match, so `grep -c ... || echo 0` emits
# TWO lines and corrupts any arithmetic that consumes it. Always use this.
countMatches() {
  local pattern="$1" file="$2"
  local count
  count=$(grep -cE "$pattern" "$file" 2>/dev/null) || count=0
  printf '%s' "${count:-0}"
}

countInverse() {
  local pattern="$1" exclude="$2" file="$3"
  local count
  count=$(grep -E "$pattern" "$file" 2>/dev/null | grep -vcE "$exclude") || count=0
  printf '%s' "${count:-0}"
}

check() {
  local label="$1" condition="$2" detail="${3:-}"
  if [ "$condition" = "pass" ]; then
    printf '  [PASS] %s\n' "$label"
    passed=$((passed + 1))
  else
    printf '  [FAIL] %-52s %s\n' "$label" "$detail"
    failed=$((failed + 1))
  fi
}

SOLUTION_XML=$(find "$WORK_DIR" -maxdepth 2 -iname 'solution.xml' | head -1)
CUSTOMIZATIONS_XML=$(find "$WORK_DIR" -maxdepth 2 -iname 'customizations.xml' | head -1)
CONTENT_TYPES=$(find "$WORK_DIR" -maxdepth 2 -iname '\[Content_Types\].xml' | head -1)

echo
echo "CRM Deployment Gate"
echo "==================="
echo "package: $TARGET"
echo

echo "Package structure"
[ -n "$SOLUTION_XML" ] \
  && check "solution.xml present" pass \
  || check "solution.xml present" fail "not found"
[ -n "$CUSTOMIZATIONS_XML" ] \
  && check "customizations.xml present" pass \
  || check "customizations.xml present" fail "not found"
[ -n "$CONTENT_TYPES" ] \
  && check "[Content_Types].xml at package root" pass \
  || check "[Content_Types].xml at package root" fail "required by OPC — GOT-004"

if [ -z "$SOLUTION_XML" ] || [ -z "$CUSTOMIZATIONS_XML" ]; then
  echo
  echo "cannot continue without solution.xml and customizations.xml"
  exit 1
fi

echo
echo "Solution manifest"

if grep -q '<Managed>0</Managed>' "$SOLUTION_XML" 2>/dev/null; then
  check "unmanaged solution" pass
else
  check "unmanaged solution" fail "hand-built packages must be unmanaged — GOT-004"
fi

# `<RootComponent ` with the trailing space — otherwise the <RootComponents>
# container element is counted as a component.
readonly ROOT_COMPONENT='<RootComponent[[:space:]]'
root_total=$(countMatches "$ROOT_COMPONENT" "$SOLUTION_XML")
root_missing_id=$(countInverse "$ROOT_COMPONENT" 'id="' "$SOLUTION_XML")
root_missing_schema=$(countInverse "$ROOT_COMPONENT" 'schemaName="' "$SOLUTION_XML")

if [ "$root_total" -eq 0 ]; then
  check "RootComponent entries present" fail "none declared"
else
  check "RootComponent entries present ($root_total)" pass
fi

# GOT-001 concerns web resources specifically (type 61). Other component types
# legitimately omit schemaName to mean "all components of this type".
readonly WEB_RESOURCE_ROOT='<RootComponent[[:space:]]+type="61"'
wr_root_total=$(countMatches "$WEB_RESOURCE_ROOT" "$SOLUTION_XML")
wr_root_no_id=$(countInverse "$WEB_RESOURCE_ROOT" 'id="\{?[0-9a-fA-F]{8}-' "$SOLUTION_XML")
wr_root_no_schema=$(countInverse "$WEB_RESOURCE_ROOT" 'schemaName="' "$SOLUTION_XML")

if [ "$wr_root_total" -eq 0 ]; then
  printf '  [SKIP] no web-resource RootComponents (type 61) in this package\n'
else
  [ "$wr_root_no_id" -eq 0 ] \
    && check "every web-resource RootComponent has a GUID id" pass \
    || check "every web-resource RootComponent has a GUID id" fail \
       "$wr_root_no_id of $wr_root_total missing — import fails 'not in target system' (GOT-001)"
  [ "$wr_root_no_schema" -eq 0 ] \
    && check "every web-resource RootComponent has schemaName" pass \
    || check "every web-resource RootComponent has schemaName" fail \
       "$wr_root_no_schema of $wr_root_total missing — GOT-001"
fi

if grep -qE 'schemaName="[^"]*/"' "$SOLUTION_XML" 2>/dev/null; then
  check "no folder-wildcard schemaName" fail "wildcards are silently ignored — GOT-001"
else
  check "no folder-wildcard schemaName" pass
fi

echo
echo "Web resources"

wr_total=$(countMatches '<WebResource>' "$CUSTOMIZATIONS_XML")
wr_guids=$(countMatches '<WebResourceId>' "$CUSTOMIZATIONS_XML")
filename_total=$(countMatches '<FileName>' "$CUSTOMIZATIONS_XML")
filename_leading_slash=$(countMatches '<FileName>/' "$CUSTOMIZATIONS_XML")

if [ "$wr_total" -eq 0 ]; then
  printf '  [SKIP] no web resources declared in customizations.xml\n'
else
  check "web resources declared ($wr_total)" pass

  [ "$wr_guids" -ge "$wr_total" ] \
    && check "every WebResource carries a WebResourceId" pass \
    || check "every WebResource carries a WebResourceId" fail \
       "$((wr_total - wr_guids)) of $wr_total missing — import fails 'not in target system' (GOT-001)"

  [ "$filename_total" -eq "$filename_leading_slash" ] \
    && check "every FileName starts with /" pass \
    || check "every FileName starts with /" fail \
       "$((filename_total - filename_leading_slash)) of $filename_total without leading slash — GOT-002"

  [ "$wr_root_total" -ge "$wr_total" ] \
    && check "RootComponents cover all web resources" pass \
    || check "RootComponents cover all web resources" fail \
       "$wr_total web resources, $wr_root_total type-61 root components — GOT-001"
fi

echo
echo "Asset URLs"
if grep -rqE '(src|href)="[^"]*\?[a-zA-Z]' "$WORK_DIR" --include=*.html 2>/dev/null; then
  check "no query strings on asset URLs" fail "on-prem returns HTTP 500 — GOT-015"
else
  check "no query strings on asset URLs" pass
fi

echo
echo "-------------------"
printf 'passed: %d   failed: %d\n\n' "$passed" "$failed"

if [ "$failed" -gt 0 ]; then
  echo "Not importable as-is. Detail for each rule: .claude/memory/company-knowledge.json"
  echo
  exit 1
fi

cat <<'NOTE'
Structural checks passed. These are the mechanical rules only — they do not
verify that RootComponent ids match their WebResourceId GUIDs pairwise, nor
that the plugin assembly is the merged, signed 4.7.1 build. Confirm both by
hand before importing. See .claude/workflows/release.md
NOTE
echo
exit 0
