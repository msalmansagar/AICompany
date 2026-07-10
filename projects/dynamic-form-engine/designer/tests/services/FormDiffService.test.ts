// RED → GREEN: FormDiffService unit tests.
//
// TDD mandate (DFE-ENH-001 Workstream H): tests written first, then implementation.
// Pure TypeScript input/output — no DOM, no Zustand, no React.
//
// Coverage:
//   - diffForms returns [] for identical objects
//   - diffForms correctly identifies CREATE, REMOVE, UPDATE changes
//   - path and area are populated correctly
//   - oldValue / newValue are set for the right change kinds
//   - nested changes are reported with full path
//   - array-element changes are reported with numeric path segments
//   - multiple changes returned when multiple properties differ
//   - empty objects produce no changes

import { describe, it, expect } from 'vitest';
import { diffForms } from '@/services/FormDiffService';
import type { FormChange } from '@/services/FormDiffService';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function findChange(changes: FormChange[], pathHead: string): FormChange | undefined {
  return changes.find(c => String(c.path[0]) === pathHead);
}

// ─── Identical objects ────────────────────────────────────────────────────────

describe('diffForms — identical snapshots', () => {
  it('should_return_empty_array_when_objects_are_identical', () => {
    const snapshot = { name: 'Loan Form', version: 3, fields: [{ id: '1', label: 'Amount' }] };

    const result = diffForms(snapshot, snapshot);

    expect(result).toHaveLength(0);
  });

  it('should_return_empty_array_when_both_objects_are_empty', () => {
    const result = diffForms({}, {});

    expect(result).toHaveLength(0);
  });
});

// ─── CREATE ───────────────────────────────────────────────────────────────────

describe('diffForms — CREATE changes', () => {
  it('should_return_CREATE_change_when_a_key_is_added', () => {
    const before = { name: 'Loan Form' };
    const after  = { name: 'Loan Form', description: 'Finance intake' };

    const result = diffForms(before, after);

    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe('CREATE');
    expect(result[0].path).toEqual(['description']);
    expect(result[0].area).toBe('description');
  });

  it('should_set_newValue_and_leave_oldValue_undefined_for_CREATE', () => {
    const before = {};
    const after  = { theme: { primaryColor: '#005A9E' } };

    const result = diffForms(before, after);

    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe('CREATE');
    expect(result[0].newValue).toEqual({ primaryColor: '#005A9E' });
    expect(result[0].oldValue).toBeUndefined();
  });
});

// ─── REMOVE ───────────────────────────────────────────────────────────────────

describe('diffForms — REMOVE changes', () => {
  it('should_return_REMOVE_change_when_a_key_is_deleted', () => {
    const before = { name: 'Loan Form', description: 'Finance intake' };
    const after  = { name: 'Loan Form' };

    const result = diffForms(before, after);

    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe('REMOVE');
    expect(result[0].path).toEqual(['description']);
  });

  it('should_set_oldValue_and_leave_newValue_undefined_for_REMOVE', () => {
    const before = { rules: [{ id: 'r1', type: 'required' }] };
    const after  = { rules: [] };

    const result = diffForms(before, after);

    const removeChange = result.find(c => c.kind === 'REMOVE');
    expect(removeChange).toBeDefined();
    expect(removeChange?.oldValue).toEqual({ id: 'r1', type: 'required' });
    expect(removeChange?.newValue).toBeUndefined();
  });
});

// ─── UPDATE ───────────────────────────────────────────────────────────────────

describe('diffForms — UPDATE changes', () => {
  it('should_return_UPDATE_change_when_a_scalar_value_changes', () => {
    const before = { name: 'Loan Form', version: 2 };
    const after  = { name: 'Loan Form v2', version: 2 };

    const result = diffForms(before, after);

    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe('UPDATE');
    expect(result[0].path).toEqual(['name']);
    expect(result[0].oldValue).toBe('Loan Form');
    expect(result[0].newValue).toBe('Loan Form v2');
  });

  it('should_set_both_oldValue_and_newValue_for_UPDATE', () => {
    const before = { status: 'draft' };
    const after  = { status: 'published' };

    const result = diffForms(before, after);

    expect(result[0].kind).toBe('UPDATE');
    expect(result[0].oldValue).toBe('draft');
    expect(result[0].newValue).toBe('published');
  });
});

// ─── Area / path ─────────────────────────────────────────────────────────────

describe('diffForms — area and path', () => {
  it('should_derive_area_from_the_first_path_segment', () => {
    const before = { fields: { f1: { label: 'Name' } } };
    const after  = { fields: { f1: { label: 'Full Name' } } };

    const result = diffForms(before, after);

    expect(result[0].area).toBe('fields');
    expect(result[0].path[0]).toBe('fields');
  });

  it('should_include_full_nested_path_for_deep_changes', () => {
    const before = { theme: { colors: { primary: '#000' } } };
    const after  = { theme: { colors: { primary: '#005A9E' } } };

    const result = diffForms(before, after);

    expect(result[0].path).toEqual(['theme', 'colors', 'primary']);
    expect(result[0].area).toBe('theme');
  });

  it('should_report_numeric_path_segments_for_array_element_changes', () => {
    const before = { rules: [{ id: 'r1', message: 'Required' }] };
    const after  = { rules: [{ id: 'r1', message: 'This field is required' }] };

    const result = diffForms(before, after);

    const msgChange = findChange(result, 'rules');
    expect(msgChange).toBeDefined();
    expect(msgChange?.path).toContain(0);
  });
});

// ─── Multiple changes ─────────────────────────────────────────────────────────

describe('diffForms — multiple simultaneous changes', () => {
  it('should_return_all_changes_when_multiple_properties_differ', () => {
    const before = { name: 'Form A', status: 'draft', version: 1 };
    const after  = { name: 'Form B', status: 'published', version: 1 };

    const result = diffForms(before, after);

    expect(result).toHaveLength(2);
    const nameChange = result.find(c => c.path[0] === 'name');
    const statusChange = result.find(c => c.path[0] === 'status');
    expect(nameChange?.kind).toBe('UPDATE');
    expect(statusChange?.kind).toBe('UPDATE');
  });

  it('should_report_mixed_CREATE_UPDATE_REMOVE_in_one_diff', () => {
    const before = { a: 1, b: 2 };
    const after  = { b: 99, c: 3 };

    const result = diffForms(before, after);

    const kinds = result.map(c => c.kind).sort();
    expect(kinds).toContain('CREATE');
    expect(kinds).toContain('UPDATE');
    expect(kinds).toContain('REMOVE');
  });
});
