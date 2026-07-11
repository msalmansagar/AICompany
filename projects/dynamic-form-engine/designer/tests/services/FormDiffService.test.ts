// RED → GREEN: FormDiffService unit tests.
//
// TDD mandate (DFE-ENH-001 Workstream H): tests written first, then implementation.
// Pure TypeScript input/output — no DOM, no Zustand, no React.
// Test names follow MethodName_Scenario_ExpectedResult convention.
//
// Coverage:
//   diffForms  — empty, CREATE, REMOVE, UPDATE, path/area, multi-change
//   summarizeDiff — empty, single area, multiple areas, singular vs plural

import { describe, it, expect } from 'vitest';
import { diffForms, summarizeDiff } from '@/services/FormDiffService';
import type { FormChange } from '@/services/FormDiffService';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function findChange(changes: FormChange[], pathHead: string): FormChange | undefined {
  return changes.find(c => String(c.path[0]) === pathHead);
}

// ─── diffForms — identical snapshots ─────────────────────────────────────────

describe('diffForms — identical snapshots', () => {
  it('diffForms_IdenticalObjects_ReturnsEmptyArray', () => {
    const snapshot = { name: 'Loan Form', version: 3, fields: [{ id: '1', label: 'Amount' }] };

    const result = diffForms(snapshot, snapshot);

    expect(result).toHaveLength(0);
  });

  it('diffForms_BothObjectsEmpty_ReturnsEmptyArray', () => {
    const result = diffForms({}, {});

    expect(result).toHaveLength(0);
  });
});

// ─── diffForms — CREATE ───────────────────────────────────────────────────────

describe('diffForms — CREATE changes', () => {
  it('diffForms_AddedTopLevelKey_ReturnsCreateChange', () => {
    const before = { name: 'Loan Form' };
    const after  = { name: 'Loan Form', description: 'Finance intake' };

    const result = diffForms(before, after);

    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe('CREATE');
    expect(result[0].path).toEqual(['description']);
    expect(result[0].area).toBe('description');
  });

  it('diffForms_AddedObjectValue_SetsNewValueAndLeavesOldValueUndefined', () => {
    const before = {};
    const after  = { theme: { primaryColor: '#005A9E' } };

    const result = diffForms(before, after);

    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe('CREATE');
    expect(result[0].newValue).toEqual({ primaryColor: '#005A9E' });
    expect(result[0].oldValue).toBeUndefined();
  });
});

// ─── diffForms — REMOVE ───────────────────────────────────────────────────────

describe('diffForms — REMOVE changes', () => {
  it('diffForms_DeletedTopLevelKey_ReturnsRemoveChange', () => {
    const before = { name: 'Loan Form', description: 'Finance intake' };
    const after  = { name: 'Loan Form' };

    const result = diffForms(before, after);

    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe('REMOVE');
    expect(result[0].path).toEqual(['description']);
  });

  it('diffForms_RemovedArrayElement_SetsOldValueAndLeavesNewValueUndefined', () => {
    const before = { rules: [{ id: 'r1', type: 'required' }] };
    const after  = { rules: [] };

    const result = diffForms(before, after);

    const removeChange = result.find(c => c.kind === 'REMOVE');
    expect(removeChange).toBeDefined();
    expect(removeChange?.oldValue).toEqual({ id: 'r1', type: 'required' });
    expect(removeChange?.newValue).toBeUndefined();
  });
});

// ─── diffForms — UPDATE ───────────────────────────────────────────────────────

describe('diffForms — UPDATE changes', () => {
  it('diffForms_ChangedScalarValue_ReturnsUpdateChange', () => {
    const before = { name: 'Loan Form', version: 2 };
    const after  = { name: 'Loan Form v2', version: 2 };

    const result = diffForms(before, after);

    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe('UPDATE');
    expect(result[0].path).toEqual(['name']);
    expect(result[0].oldValue).toBe('Loan Form');
    expect(result[0].newValue).toBe('Loan Form v2');
  });

  it('diffForms_ChangedStringValue_SetsBothOldAndNewValues', () => {
    const before = { status: 'draft' };
    const after  = { status: 'published' };

    const result = diffForms(before, after);

    expect(result[0].kind).toBe('UPDATE');
    expect(result[0].oldValue).toBe('draft');
    expect(result[0].newValue).toBe('published');
  });
});

// ─── diffForms — area / path ──────────────────────────────────────────────────

describe('diffForms — area and path', () => {
  it('diffForms_NestedChange_DerivesAreaFromFirstPathSegment', () => {
    const before = { fields: { f1: { label: 'Name' } } };
    const after  = { fields: { f1: { label: 'Full Name' } } };

    const result = diffForms(before, after);

    expect(result[0].area).toBe('fields');
    expect(result[0].path[0]).toBe('fields');
  });

  it('diffForms_DeepNestedChange_ReportsFullPath', () => {
    const before = { theme: { colors: { primary: '#000' } } };
    const after  = { theme: { colors: { primary: '#005A9E' } } };

    const result = diffForms(before, after);

    expect(result[0].path).toEqual(['theme', 'colors', 'primary']);
    expect(result[0].area).toBe('theme');
  });

  it('diffForms_ArrayElementChange_ReportsNumericPathSegment', () => {
    const before = { rules: [{ id: 'r1', message: 'Required' }] };
    const after  = { rules: [{ id: 'r1', message: 'This field is required' }] };

    const result = diffForms(before, after);

    const msgChange = findChange(result, 'rules');
    expect(msgChange).toBeDefined();
    expect(msgChange?.path).toContain(0);
  });
});

// ─── diffForms — multiple changes ─────────────────────────────────────────────

describe('diffForms — multiple simultaneous changes', () => {
  it('diffForms_MultipleChangedProperties_ReturnsAllChanges', () => {
    const before = { name: 'Form A', status: 'draft', version: 1 };
    const after  = { name: 'Form B', status: 'published', version: 1 };

    const result = diffForms(before, after);

    expect(result).toHaveLength(2);
    expect(result.find(c => c.path[0] === 'name')?.kind).toBe('UPDATE');
    expect(result.find(c => c.path[0] === 'status')?.kind).toBe('UPDATE');
  });

  it('diffForms_MixedAddedChangedDeleted_ReportsCreateUpdateAndRemove', () => {
    const before = { a: 1, b: 2 };
    const after  = { b: 99, c: 3 };

    const result = diffForms(before, after);

    const kinds = result.map(c => c.kind).sort();
    expect(kinds).toContain('CREATE');
    expect(kinds).toContain('UPDATE');
    expect(kinds).toContain('REMOVE');
  });
});

// ─── summarizeDiff ────────────────────────────────────────────────────────────

describe('summarizeDiff', () => {
  it('summarizeDiff_EmptyChanges_ReturnsZeroTotalAndNoChangesMessage', () => {
    const result = summarizeDiff([]);

    expect(result.totalChanges).toBe(0);
    expect(result.humanReadable).toBe('No changes');
  });

  it('summarizeDiff_SingleAreaWithOneChange_ReturnsCorrectCountAndAreaName', () => {
    const changes = diffForms(
      { status: 'draft' },
      { status: 'published' },
    );

    const result = summarizeDiff(changes);

    expect(result.totalChanges).toBe(1);
    expect(result.humanReadable).toContain('status');
    expect(result.humanReadable).toContain('1');
  });

  it('summarizeDiff_MultipleAreas_FormatsEachAreaSeparately', () => {
    const changes = diffForms(
      { name: 'A', status: 'draft' },
      { name: 'B', status: 'published' },
    );

    const result = summarizeDiff(changes);

    expect(result.totalChanges).toBe(2);
    expect(result.humanReadable).toContain('name');
    expect(result.humanReadable).toContain('status');
  });

  it('summarizeDiff_OneChangeInArea_UsesChangeSingularForm', () => {
    const changes = diffForms({ x: 1 }, { x: 2 });

    const result = summarizeDiff(changes);

    expect(result.humanReadable).toMatch(/\b1 x change\b/);
  });

  it('summarizeDiff_TwoChangesInOneArea_UsesPluralChanges', () => {
    const changes = diffForms(
      { fields: { f1: { label: 'A' }, f2: { label: 'B' } } },
      { fields: { f1: { label: 'X' }, f2: { label: 'Y' } } },
    );

    const result = summarizeDiff(changes);

    expect(result.humanReadable).toContain('changes');
    expect(result.totalChanges).toBe(2);
  });
});
