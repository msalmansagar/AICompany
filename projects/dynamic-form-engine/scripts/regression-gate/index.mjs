#!/usr/bin/env node
/**
 * FR-CSE-025 — Render-cache content regression gate (CLI entry point).
 *
 * Usage — run from the repository root:
 *
 *   Capture:
 *     node --env-file=scripts/.env scripts/regression-gate/index.mjs capture --out <file>
 *
 *   Compare against a previously captured file:
 *     node --env-file=scripts/.env scripts/regression-gate/index.mjs compare \
 *       --baseline <file> --current <file>
 *
 *   Compare against the live org (re-reads CRM):
 *     node --env-file=scripts/.env scripts/regression-gate/index.mjs compare \
 *       --baseline <file> --current live
 *
 *   Strip additional volatile stamps beyond the defaults:
 *     ... compare --baseline <file> --current <file> --strip-extra-stamps key1,key2
 *
 * Exit codes:
 *   0  Identical — no blocking differences; release may proceed.
 *   1  Different  — removed or changed forms; release is BLOCKED.
 *   2  Usage error.
 *
 * @module regression-gate/index
 */
import { resolve } from 'node:path';
import { runCapture } from './capture.mjs';
import { compareBaselines, loadBaseline, captureCurrentState } from './compare.mjs';

const args = process.argv.slice(2);
const command = args[0];

if (command === 'capture') {
  await runCaptureCommand(args.slice(1));
} else if (command === 'compare') {
  await runCompareCommand(args.slice(1));
} else {
  printUsageError(command);
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Command handlers
// ---------------------------------------------------------------------------

/**
 * @param {string[]} argv
 */
async function runCaptureCommand(argv) {
  const outPath = requireArg(argv, '--out');
  const absPath = resolve(outPath);
  console.log(`Capturing render-cache baseline → ${absPath}`);
  const { entryCount, orgUrl } = await runCapture(absPath);
  console.log(`Org:     ${orgUrl}`);
  console.log(`Entries: ${entryCount} active render-cache rows captured.`);
  console.log('Done. Store this file, deploy the DFE, re-publish all forms, then compare.');
}

/**
 * @param {string[]} argv
 */
async function runCompareCommand(argv) {
  const baselinePath = requireArg(argv, '--baseline');
  const currentArg = getArg(argv, '--current');
  const extraStampsArg = getArg(argv, '--strip-extra-stamps');
  const extraStamps = extraStampsArg ? extraStampsArg.split(',').map((s) => s.trim()) : [];

  const baseline = loadBaseline(resolve(baselinePath));
  const current = await resolveCurrentBaseline(currentArg);

  const result = compareBaselines(baseline, current, extraStamps);
  printCompareResult(result, baseline.orgUrl, current.orgUrl);

  if (result.status === 'different') {
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * @param {string | undefined} currentArg
 * @returns {Promise<import('./compare.mjs').Baseline>}
 */
async function resolveCurrentBaseline(currentArg) {
  if (!currentArg || currentArg === 'live') {
    console.log('--current not specified; reading current state from live org…\n');
    return captureCurrentState();
  }
  return loadBaseline(resolve(currentArg));
}

/**
 * @param {import('./compare.mjs').CompareResult} result
 * @param {string} baselineOrgUrl
 * @param {string} currentOrgUrl
 */
function printCompareResult(result, baselineOrgUrl, currentOrgUrl) {
  console.log(`Baseline org:  ${baselineOrgUrl}`);
  console.log(`Current org:   ${currentOrgUrl}`);
  console.log(`Status:        ${result.status.toUpperCase()}\n`);

  if (result.added.length > 0) {
    console.log(`Added forms (${result.added.length}) — informational, not blocking:`);
    for (const f of result.added) {
      console.log(`  + ${f.formCode} [${f.language}]`);
    }
    console.log('');
  }

  if (result.removed.length > 0) {
    console.log(`Removed forms (${result.removed.length}) — BLOCKING:`);
    for (const f of result.removed) {
      console.log(`  - ${f.formCode} [${f.language}]`);
    }
    console.log('');
  }

  if (result.changed.length > 0) {
    console.log(`Changed forms (${result.changed.length}) — BLOCKING:`);
    for (const f of result.changed) {
      console.log(`  ~ ${f.formCode} [${f.language}] — ${f.diffs.length} diff(s):`);
      for (const d of f.diffs) {
        console.log(`      ${d.op.padEnd(7)}  ${d.path}`);
        if (d.op === 'changed') {
          console.log(`               from: ${formatValue(d.from)}`);
          console.log(`               to:   ${formatValue(d.to)}`);
        }
      }
    }
    console.log('');
  }

  if (result.status === 'identical') {
    console.log('No regressions detected. Release may proceed.');
  } else {
    console.log('Regressions detected. Release is BLOCKED until differences are resolved.');
  }
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function formatValue(value) {
  if (value === undefined) return '(absent)';
  const json = JSON.stringify(value);
  return json.length > 120 ? `${json.slice(0, 117)}…` : json;
}

/**
 * @param {string[]} argv
 * @param {string} flag
 * @returns {string}
 */
function requireArg(argv, flag) {
  const value = getArg(argv, flag);
  if (!value) {
    console.error(`Error: missing required argument: ${flag}`);
    process.exit(2);
  }
  return value;
}

/**
 * @param {string[]} argv
 * @param {string} flag
 * @returns {string | undefined}
 */
function getArg(argv, flag) {
  const idx = argv.indexOf(flag);
  return idx !== -1 ? argv[idx + 1] : undefined;
}

/**
 * @param {string | undefined} command
 */
function printUsageError(command) {
  console.error(`Error: unknown command: ${command ?? '(none provided)'}`);
  console.error('');
  console.error('Usage:');
  console.error('  index.mjs capture --out <file>');
  console.error('  index.mjs compare --baseline <file> [--current <file>|live]');
  console.error('            [--strip-extra-stamps <comma-separated-keys>]');
}
