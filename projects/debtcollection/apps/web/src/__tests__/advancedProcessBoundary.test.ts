import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * WP7 — the cross-process boundary, enforced on the source rather than trusted to review.
 *
 * Legal and Case Management own their records, and both live in BFD CRM for HL and BFD customers
 * alike. The workspace never addresses either table from the browser: a Complaint is raised, and
 * either record's status is read, only through the Integration Service, which acts as the user in
 * the owning organisation (docs/ExternalProcessReference.md). So:
 *
 * - no browser source names the Legal or Case Management table;
 * - no browser source writes the external process reference — the service records it after the
 *   owning module has created the record, so the browser cannot claim a hand-off that did not happen;
 * - an officer hand-off to Legal stays closed until QDB sets a qualification rule (KI-109).
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

/** An external process reference column written as a payload key. */
const WRITES_REFERENCE = /['"]qdb_relatedrecord(?:id|number|organization|type)['"]\s*:/;

/** The Legal or Case Management table, addressed as an entity set or an entity set name. */
const NAMES_LEGAL_OR_COMPLAINT_SET = /ENTITY_SETS\.(litigationRequest|complaintCase)\b|\bqdb_qdblegals\b|['"`/]incidents\b/;

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
    ['a written reference id', WRITES_REFERENCE, "{ 'qdb_relatedrecordid': caseId }"],
    ['a written reference number', WRITES_REFERENCE, '{ "qdb_relatedrecordnumber": number }'],
    ['a Legal set reference', NAMES_LEGAL_OR_COMPLAINT_SET, '{ entity: ENTITY_SETS.litigationRequest, id }'],
    ['a Case Management set path', NAMES_LEGAL_OR_COMPLAINT_SET, "retrieveRecord('/incidents', id)"],
    ['a write', WRITES, 'await adapter.createIdempotent(set, id, body)'],
    ['a hand-off helper call', USES_HANDOFF_WRITE, 'const id = litigationRequestId(activityId);'],
    ['a hand-off helper import', USES_HANDOFF_WRITE, "import { decideLegalHandoff, interpretHandoffWrite } from '@dcp/domain';"],
  ])('would recognise %s', (_what, pattern, sample) => {
    expect(pattern.test(sample)).toBe(true);
  });

  it('does not mistake the read link property for the hand-off helper', () => {
    expect(USES_HANDOFF_WRITE.test('{ litigationRequestId: reference.recordId }')).toBe(false);
  });

  it('does not mistake a filter on the reference type for a write', () => {
    expect(WRITES_REFERENCE.test("qdb_relatedrecordtype eq 'incident'")).toBe(false);
  });
});

describe('the workspace and the processes it does not own', () => {
  it('never writes an external process reference from the browser', () => {
    expect(files.filter(file => WRITES_REFERENCE.test(file.text)).map(file => relative(file.path))).toEqual([]);
  });

  it('never addresses the Legal or Case Management table from the browser', () => {
    expect(files.filter(file => NAMES_LEGAL_OR_COMPLAINT_SET.test(file.text)).map(file => relative(file.path))).toEqual([]);
  });

  it('does read the reference, so the sweep is about real code', () => {
    expect(files.some(file => file.text.includes('qdb_relatedrecordtype'))).toBe(true);
  });

  it('uses none of the domain’s write-side Legal hand-off helpers', () => {
    expect(files.filter(file => USES_HANDOFF_WRITE.test(file.text)).map(file => relative(file.path)))
      .toEqual([]);
  });
});
