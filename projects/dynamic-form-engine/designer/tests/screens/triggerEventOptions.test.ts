// trigger_event was a read-only text box reading "On Change" because no engine consumed the
// value. The runtime now reads each event against its own snapshot of the form, so the
// choice is real and the designer offers it.

import { describe, it, expect } from 'vitest';
import { TRIGGER_EVENT_OPTIONS } from '@/screens/ruleDefaults';
import { RULE_TRIGGER_EVENTS } from '@qdb/shared';

describe('TRIGGER_EVENT_OPTIONS', () => {
  // Offering a value the runtime cannot honour is the failure this work exists to avoid.
  it('offersExactlyTheEventsTheRuntimeSupports', () => {
    const offered = TRIGGER_EVENT_OPTIONS.map(option => option.value).sort();

    expect(offered).toEqual([...RULE_TRIGGER_EVENTS].sort());
  });

  it('labelsEveryOption', () => {
    for (const option of TRIGGER_EVENT_OPTIONS) {
      expect(option.label.length).toBeGreaterThan(0);
    }
  });

  it('leadsWithOnChange_theDefault', () => {
    expect(TRIGGER_EVENT_OPTIONS[0].value).toBe('on_change');
  });

  // The labels are what a maker chooses between, so each has to say when it fires.
  it('describesWhenEachEventFires', () => {
    for (const option of TRIGGER_EVENT_OPTIONS) {
      expect(option.hint.length).toBeGreaterThan(0);
    }
  });
});
