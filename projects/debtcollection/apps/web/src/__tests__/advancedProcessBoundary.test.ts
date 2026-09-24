import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * WP7 — the cross-process boundary, enforced on the source rather than trusted to review.
 *
 * Legal and Case Management own their records. The workspace reads Litigation Requests and
 * Complaint cases; it must never create, change or link one from an officer's session:
 *
 * - an officer hand-off to Legal is closed until QDB sets a qualification rule (KI-109);
 * - raising a Complaint needs security QDB has not granted (KI-120);
 * - linking an activity to either is how those records would be raised, so binding the lookups is
 *   the same act by another route.
 *
 * Each rule below says what it would catch, and is shown to recognise it, so a clean sweep means a
 * clean source rather than a pattern that could never match.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE_ROOT = join(HERE, '..');

const sourceFiles = (directory: string): string[] =>
  readdirSync(directory).flatMap(entry => {
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) return entry === '__tests__' ? [] : sourceFiles(full);
    return /\.tsx?$/.test(entry) ? [full] : [];
  });

const files = sourceFiles(SOURCE_ROOT).map(path => ({ path, text: readFileSync(path, 'utf8') }));
const relative = (path: string) => path.slice(SOURCE_ROOT.length + 1).replace(/\\/g, '/');

/** A lookup to Legal or a Complaint, bound in a write payload. */
const BINDS_LEGAL_OR_COMPLAINT =
  /(qdb_legalrequestid|qdb_complaintcaseid|activityToLegalRequest|activityToComplaintCase)[^\n]{0,80}@odata\.bind/;

/** A reference to the Legal or Complaint entity set. */
const NAMES_LEGAL_OR_COMPLAINT_SET = /ENTITY_SETS\.(litigationRequest|complaintCase)\b/;

/** Any write the adapter or a service offers. */
const WRITES = /\.(createIdempotent|createOnly|create|patch|post|update)\(/;

/**
 * The domain's write-side Legal helpers — the derived Litigation Request id and its write result —
 * called or imported. `litigationRequestId` is also the name of the recommendation's *read* link
 * property, which is legitimate, so a bare name is not enough.
 */
const USES_HANDOFF_WRITE =
  /\b(?:litigationRequestId|interpretHandoffWrite)\s*\(|import\s*\{[^}]*\b(?:litigationRequestId|interpretHandoffWrite)\b/;

describe('the sweep itself', () => {
  it('reads the application source rather than silently finding nothing', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it.each([
    ['a bound Legal lookup', BINDS_LEGAL_OR_COMPLAINT, "'qdb_legalrequestid@odata.bind': `/qdb_qdblegals(${id})`"],
    ['a bound navigation property', BINDS_LEGAL_OR_COMPLAINT, '[`${NAVIGATION_PROPERTIES.activityToComplaintCase}@odata.bind`]: ref'],
    ['a Legal set reference', NAMES_LEGAL_OR_COMPLAINT_SET, '{ entity: ENTITY_SETS.litigationRequest, id }'],
    ['a write', WRITES, 'await adapter.createIdempotent(set, id, body)'],
    ['a hand-off helper call', USES_HANDOFF_WRITE, 'const id = litigationRequestId(activityId);'],
    ['a hand-off helper import', USES_HANDOFF_WRITE, "import { decideLegalHandoff, interpretHandoffWrite } from '@dcp/domain';"],
  ])('would recognise %s', (_what, pattern, sample) => {
    expect(pattern.test(sample)).toBe(true);
  });

  it('does not mistake the read link property for the hand-off helper', () => {
    expect(USES_HANDOFF_WRITE.test('{ litigationRequestId: activity.legalRequestId }')).toBe(false);
  });
});

describe('the workspace and the processes it does not own', () => {
  it('binds no activity to a Litigation Request or a Complaint', () => {
    expect(files.filter(file => BINDS_LEGAL_OR_COMPLAINT.test(file.text)).map(file => relative(file.path)))
      .toEqual([]);
  });

  it('only ever reads where it names the Legal or Complaint entity set', () => {
    const writers = files.filter(file => NAMES_LEGAL_OR_COMPLAINT_SET.test(file.text) && WRITES.test(file.text));

    expect(writers.map(file => relative(file.path))).toEqual([]);
  });

  it('is asserting about real readers, not an empty set', () => {
    const readers = files.filter(file => NAMES_LEGAL_OR_COMPLAINT_SET.test(file.text)).map(file => relative(file.path));

    expect(readers).toEqual(expect.arrayContaining(['data/legalQueries.ts', 'data/complaintQueries.ts']));
  });

  it('uses none of the domain’s write-side Legal hand-off helpers', () => {
    expect(files.filter(file => USES_HANDOFF_WRITE.test(file.text)).map(file => relative(file.path)))
      .toEqual([]);
  });
});
