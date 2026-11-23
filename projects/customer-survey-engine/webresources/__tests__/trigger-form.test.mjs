// qdb_/survey/trigger-form.js: which sections a trigger's kind shows (Addendum D; 001-scale-per-org FR-005).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const form = createRequire(import.meta.url)('../trigger-form.js');

const KIND = { event: 100000000, scheduled: 100000002, oneTime: 100000004 };

/** A form context with the trigger's sections; records each section's visibility and the kind's change handler. */
function formWithKind(kind) {
  const visible = {};
  const handlers = [];
  const sections = new Map(['One_time', 'Scheduled_run', 'Trigger'].map((name) => [name, { setVisible: (isVisible) => { visible[name] = isVisible; } }]));
  const kindAttribute = { value: kind, getValue() { return this.value; }, addOnChange: (handler) => handlers.push(handler) };
  const formContext = {
    getAttribute: (name) => (name === 'qdb_trigger_kind' ? kindAttribute : null),
    getControl: () => null,
    ui: { tabs: { forEach: (visit) => visit({ sections: { get: (name) => sections.get(name) } }) }, setFormNotification: () => {} },
  };
  return { visible, formContext, changeKind: (next) => { kindAttribute.value = next; handlers.forEach((handler) => handler()); } };
}

const load = (fixture) => form.onLoad({ getFormContext: () => fixture.formContext });

test('onLoad_scheduledTrigger_showsTheScheduledRunSection_FR005', () => {
  const fixture = formWithKind(KIND.scheduled);

  load(fixture);

  assert.deepEqual([fixture.visible.Scheduled_run, fixture.visible.One_time], [true, false]);
});

test('onLoad_eventTrigger_hidesTheScheduledRunSection', () => {
  const fixture = formWithKind(KIND.event);

  load(fixture);

  assert.equal(fixture.visible.Scheduled_run, false);
});

test('onLoad_oneTimeTrigger_keepsShowingOnlyTheOneTimeSection', () => {
  const fixture = formWithKind(KIND.oneTime);
  fixture.formContext.getControl = () => ({ getContentWindow: () => Promise.resolve({}) });

  load(fixture);

  assert.deepEqual([fixture.visible.One_time, fixture.visible.Scheduled_run], [true, false]);
});

test('kindChangedToScheduled_showsTheScheduledRunSection', () => {
  const fixture = formWithKind(KIND.event);
  load(fixture);

  fixture.changeKind(KIND.scheduled);

  assert.equal(fixture.visible.Scheduled_run, true);
});
