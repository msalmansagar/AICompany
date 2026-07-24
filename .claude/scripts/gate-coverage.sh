#!/usr/bin/env bash
# Maqsad AI — Coverage Gate (READ-ONLY)
#
# Reports which packages can be measured for test coverage, and measures the
# ones that can. Constitution Article IV requires 80%.
#
# A package with no coverage script reports SKIP with the reason. It is never
# reported as PASS — silence is not evidence.
#
# Modifies nothing. Installs nothing.
#
#   .claude/scripts/gate-coverage.sh              inventory only (fast)
#   .claude/scripts/gate-coverage.sh --run        also run configured suites
#   .claude/scripts/gate-coverage.sh --strict     non-zero if any package is unmeasurable

set -uo pipefail

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$REPO_ROOT" || exit 1

readonly THRESHOLD=80

RUN_SUITES=0
STRICT=0
for arg in "$@"; do
  case "$arg" in
    --run) RUN_SUITES=1 ;;
    --strict) STRICT=1 ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

# One node process reads every manifest and classifies it, emitting
# "dir<TAB>state<TAB>reason". Paths stay relative so node resolves them
# against the shell's real working directory.
inventory() {
  git ls-files | grep 'package.json$' | grep -v node_modules | node -e '
    const fs = require("fs");
    let input = "";
    process.stdin.on("data", (chunk) => (input += chunk));
    process.stdin.on("end", () => {
      for (const manifest of input.split("\n").map((l) => l.trim()).filter(Boolean)) {
        let state = "skip";
        let reason = "unreadable manifest";
        try {
          const pkg = JSON.parse(fs.readFileSync(manifest, "utf8"));
          const scripts = pkg.scripts || {};
          const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
          const hasCoverageScript = Boolean(scripts["test:coverage"] || scripts.coverage);
          const hasProvider = Object.keys(deps).some((d) => d.includes("coverage"));
          const hasTest = Boolean(scripts.test);

          if (hasCoverageScript) {
            state = "measurable";
            reason = "coverage script present";
          } else if (hasTest && hasProvider) {
            reason = "provider installed, no test:coverage script";
          } else if (hasTest) {
            reason = "tests present, no coverage provider";
          } else {
            reason = "no test script at all";
          }
        } catch (error) {
          reason = `unreadable manifest (${error.message.slice(0, 40)})`;
        }
        console.log([manifest.replace(/\/package\.json$/, ""), state, reason].join("\t"));
      }
    });
  '
}

measurable=0
unmeasurable=0
failed=0

echo
echo "Coverage Gate — Constitution Article IV requires ${THRESHOLD}%"
echo "=============================================================="
echo
printf '%-52s %s\n' "PACKAGE" "STATUS"
printf '%-52s %s\n' "-------" "------"

while IFS=$'\t' read -r package_dir state reason; do
  [ -z "$package_dir" ] && continue
  label=${package_dir#projects/}

  if [ "$state" != "measurable" ]; then
    unmeasurable=$((unmeasurable + 1))
    printf '%-52s [SKIP] %s\n' "$label" "$reason"
    continue
  fi

  measurable=$((measurable + 1))
  if [ "$RUN_SUITES" -eq 0 ]; then
    printf '%-52s [MEASURABLE] %s\n' "$label" "$reason"
    continue
  fi

  printf '%-52s running...' "$label"
  if (cd "$package_dir" && npm run --silent test:coverage >/dev/null 2>&1); then
    printf '\r%-52s [PASS] coverage suite green\n' "$label"
  else
    printf '\r%-52s [FAIL] suite red or coverage below threshold\n' "$label"
    failed=$((failed + 1))
  fi
done < <(inventory)

total=$((measurable + unmeasurable))
echo
echo "--------------------------------------------------------------"
printf 'measurable:   %d of %d packages\n' "$measurable" "$total"
printf 'unmeasurable: %d — coverage cannot be enforced on these\n' "$unmeasurable"
[ "$RUN_SUITES" -eq 1 ] && printf 'failing:      %d\n' "$failed"
echo

cat <<'NOTE'
Making an unmeasurable package measurable means adding a test:coverage script
and a coverage provider to that package — a change to project files, and
deliberately out of scope for this gate. Do it per project, on purpose.
NOTE
echo

if [ "$RUN_SUITES" -eq 1 ] && [ "$failed" -gt 0 ]; then exit 1; fi
if [ "$STRICT" -eq 1 ] && [ "$unmeasurable" -gt 0 ]; then exit 1; fi
exit 0
