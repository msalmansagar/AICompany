import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Snapshot immutability is an application invariant, not a test convenience.
 *
 * `qdb_delinquencysnapshot` is append-only by design (ADR-05): the MIS history is evidence, and
 * evidence that can be edited is not evidence. The organisation enforces it with
 * `ImmutabilityGuardPlugin`, which refuses an update or a delete with *"records are permanently
 * immutable and cannot be modified or deleted"*.
 *
 * WP16's integration fixture had to disable that guard to remove a synthetic snapshot it had
 * created, and restore it afterwards. That capability is **test infrastructure**, and this file
 * exists to keep it there. It scans the shipped application source for any ability to disable a
 * plugin step, write to a snapshot, or delete one — because the cheapest way for an invariant to
 * be lost is for someone to reuse a cleanup helper in a hurry.
 *
 * The guard is scoped deliberately: it reads the **application** trees only. `crm/scripts` is
 * integration tooling, runs under an administrator identity, and is where the fixture belongs.
 */

/**
 * Resolved from this file, not from `process.cwd()`.
 *
 * The first draft used the working directory and swept **zero** files — which the "not vacuous"
 * test below caught immediately. That test exists precisely because a scanner that silently finds
 * nothing passes forever.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const WEB_SRC = join(HERE, '..');
const REPO = join(WEB_SRC, '..', '..', '..');

const APPLICATION_TREES = [
  WEB_SRC,
  join(REPO, 'apps', 'api', 'src'),
  join(REPO, 'packages', 'domain', 'src'),
];

/** Ways to switch a registered plugin step off. Any mention in application code is the defect. */
const DISABLES_A_PLUGIN_STEP = /sdkmessageprocessingstep/i;

/** A mutating verb. Checked for co-occurrence with the snapshot entity in the same file. */
const MUTATING_VERB = /['"`](DELETE|PATCH|POST)['"`]|\.(update|delete|create|upsert)\s*\(/;
const NAMES_A_SNAPSHOT = /qdb_delinquencysnapshot/i;

/**
 * A file that both names the snapshot entity and performs a mutation.
 *
 * Co-occurrence rather than one clever expression: each half is simple enough to be obviously
 * correct, and a reader can see what would trip it. **Reading** snapshots is expected everywhere
 * and must not trip it, which is why a mutating verb is required as well.
 */
const mutatesASnapshot = (source: string): boolean =>
  NAMES_A_SNAPSHOT.test(source) && MUTATING_VERB.test(source);

function sourceFiles(directory: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(directory);
  } catch {
    return [];
  }
  return entries.flatMap(entry => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      // Tests may legitimately describe the forbidden shapes, including this file.
      return entry === '__tests__' || entry === 'node_modules' || entry === 'dist'
        ? [] : sourceFiles(path);
    }
    return /\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [path] : [];
  });
}

describe('production code cannot reach the fixture cleanup path', () => {
  const files = APPLICATION_TREES.flatMap(sourceFiles);

  it('scans a meaningful amount of application source, so the sweep is not vacuous', () => {
    // A guard that silently scanned nothing would pass forever.
    expect(files.length).toBeGreaterThan(50);
  });

  it('never disables a registered plugin step', () => {
    const offenders = files.filter(file =>
      DISABLES_A_PLUGIN_STEP.test(readFileSync(file, 'utf8')));

    expect(offenders.map(file => file.replace(REPO, ''))).toEqual([]);
  });

  it('never updates or deletes a delinquency snapshot', () => {
    const offenders = files.filter(file => mutatesASnapshot(readFileSync(file, 'utf8')));

    expect(offenders.map(file => file.replace(REPO, ''))).toEqual([]);
  });

  it('would catch the forbidden shapes if they appeared', () => {
    // The patterns are asserted against known-bad text, so a typo that made them match nothing
    // would fail here rather than passing the two sweeps above for the wrong reason.
    expect(DISABLES_A_PLUGIN_STEP.test(
      "await write(cfg, token, 'PATCH', `/sdkmessageprocessingsteps(${id})`, { statecode: 1 })"))
      .toBe(true);
    expect(mutatesASnapshot(
      "await write(cfg, token, 'DELETE', `/qdb_delinquencysnapshots(${id})`)")).toBe(true);
    expect(mutatesASnapshot(
      "await adapter.update({ entity: 'qdb_delinquencysnapshots', id }, patch)")).toBe(true);
    // Reading snapshots is expected everywhere and must not trip the guard.
    expect(mutatesASnapshot(
      "const page = await adapter.retrievePage(ENTITY_SETS.delinquencySnapshot, query)"))
      .toBe(false);
  });
});
