import { describe, it, expect } from 'vitest';
import { serializeDesignerState, parseDesignerState } from './designerState';

/**
 * CWFD-016 B7 — publishing over warnings records what was accepted. States
 * written before B7 have no acknowledgement block and must still parse.
 */
describe('warning acknowledgement in the designer state', () => {
  it('should_round_trip_an_acknowledgement', () => {
    const json = serializeDesignerState({
      workflowState: 'published',
      versionMajor: 1,
      versionMinor: 2,
      snapshot: null,
      acknowledgedWarnings: { at: '2026-08-29T00:00:00.000Z', count: 49, codes: ['MISSING_TASK_SUBJECT', 'ORPHAN_STEP'] },
    });
    const parsed = parseDesignerState(json)!;
    expect(parsed.acknowledgedWarnings).toEqual({
      at: '2026-08-29T00:00:00.000Z',
      count: 49,
      codes: ['MISSING_TASK_SUBJECT', 'ORPHAN_STEP'],
    });
  });

  it('should_read_a_pre_B7_state_as_having_no_acknowledgement', () => {
    const legacy = JSON.stringify({ v: 1, workflowState: 'published', versionMajor: 2, versionMinor: 0, snapshot: null });
    const parsed = parseDesignerState(legacy)!;
    expect(parsed.workflowState).toBe('published');
    expect(parsed.acknowledgedWarnings).toBeNull();
  });

  it('should_ignore_a_malformed_acknowledgement_rather_than_throw', () => {
    const odd = JSON.stringify({ v: 1, workflowState: 'published', versionMajor: 1, versionMinor: 0, snapshot: null, acknowledgedWarnings: 'yes' });
    expect(parseDesignerState(odd)!.acknowledgedWarnings).toBeNull();
  });
});
